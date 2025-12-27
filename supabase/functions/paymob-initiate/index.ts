import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { booking_id } = await req.json();
    if (!booking_id) throw new Error("Missing booking_id");

    // 1. Fetch booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("user_id", user.id)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found or access denied");
    }

    if (booking.status !== "pending") {
      throw new Error("Booking is not pending");
    }

    // 2. Check if payment already exists
    // We use the service_role key to manage payments table if RLS blocks user writes (though we allowed insert only? No, we allowed insert via backend usually, let's check policies).
    // The policy says: "insert/update: only backend service role".
    // So we MUST use a service role client for the payments table.
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("booking_id", booking_id)
      .single();

    if (existingPayment) {
      if (existingPayment.status === "paid") {
         throw new Error("Booking already paid");
      }
      if (existingPayment.status === "initiated" && existingPayment.provider_payment_key) {
        // Return existing key
        const iframeId = Deno.env.get("PAYMOB_IFRAME_ID");
        return new Response(
          JSON.stringify({
            payment_key: existingPayment.provider_payment_key,
            iframe_url: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${existingPayment.provider_payment_key}`,
            booking_id,
            amount: booking.total_amount,
            currency: booking.currency,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // If failed or no key, retry flow below
    }

    // 3. Initiate PayMob
    const apiKey = Deno.env.get("PAYMOB_API_KEY");
    const integrationId = Deno.env.get("PAYMOB_INTEGRATION_ID");
    const iframeId = Deno.env.get("PAYMOB_IFRAME_ID");

    if (!apiKey || !integrationId || !iframeId) {
       throw new Error("Server misconfiguration: Missing PayMob env vars");
    }

    // A) Auth Token
    const authResp = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const authData = await authResp.json();
    if (!authData.token) throw new Error("Failed to authenticate with PayMob");
    const token = authData.token;

    // B) Create Order
    // Amount in cents
    const amountCents = Math.round(booking.total_amount * 100);
    const orderResp = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            auth_token: token,
            delivery_needed: "false",
            amount_cents: amountCents,
            currency: booking.currency ?? "EGP",
            merchant_order_id: booking_id, 
            items: [], // Optional
        }),
    });
    const orderData = await orderResp.json();
    if (!orderData.id) throw new Error("Failed to create PayMob order: " + JSON.stringify(orderData));
    const orderId = orderData.id;

    // C) Payment Key
    // We need billing data (dummy if not collected, PayMob requires it)
    // We'll use booking details or dummy
    const billingData = {
        "apartment": "NA", 
        "email": user.email || "customer@example.com", 
        "floor": "NA", 
        "first_name": user.email?.split('@')[0] || "Customer", 
        "street": "NA", 
        "building": "NA", 
        "phone_number": "+201234567890", 
        "shipping_method": "NA", 
        "postal_code": "NA", 
        "city": "NA", 
        "country": "NA", 
        "last_name": "User", 
        "state": "NA"
    };

    const keyResp = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            auth_token: token,
            amount_cents: amountCents,
            expiration: 3600, 
            order_id: orderId,
            billing_data: billingData,
            currency: booking.currency ?? "EGP",
            integration_id: integrationId,
        }),
    });
    const keyData = await keyResp.json();
    if (!keyData.token) throw new Error("Failed to get PayMob payment key: " + JSON.stringify(keyData));
    const paymentKey = keyData.token;

    // 4. Save to DB
    const { error: upsertError } = await supabaseAdmin
        .from("payments")
        .upsert({
            booking_id: booking_id,
            provider: "paymob",
            provider_order_id: orderId.toString(),
            provider_payment_key: paymentKey,
            amount: booking.total_amount,
            currency: booking.currency,
            status: "initiated"
        }, { onConflict: "booking_id" });

    if (upsertError) {
        throw new Error("Failed to save payment record: " + upsertError.message);
    }

    return new Response(
      JSON.stringify({
        payment_key: paymentKey,
        iframe_url: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`,
        booking_id,
        amount: booking.total_amount,
        currency: booking.currency,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
