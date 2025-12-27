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

        const { data: { user } } = await supabaseClient.auth.getUser();

        const url = new URL(req.url);
        const path = url.pathname.split("/").pop(); // bookings or mark-read or rooms? 
        // Actually the function path is /bookings. 
        // If the user deployed it as 'bookings', `req.url` might be `.../functions/v1/bookings` or `.../functions/v1/bookings/mark-read`.
        // Let's inspect the last segment or use pattern matching on `url.pathname`.

        // Dispatcher
        if (req.method === "GET" && url.pathname.includes("/rooms")) {
            return handleGetRooms(req, supabaseClient, url); // Public (usually), but we can use client
        }
        // We might need to route based on method for root
        if (req.method === "GET") {
            // GET /bookings
            if (!user) throw new Error("Unauthorized");
            return handleGetBookings(req, supabaseClient, user);
        }
        if (req.method === "POST") {
            if (url.pathname.includes("/mark-read")) {
                if (!user) throw new Error("Unauthorized");
                return handleMarkRead(req, supabaseClient, user);
            }
            // POST /bookings
            if (!user) throw new Error("Unauthorized");
            return handleCreateBooking(req, supabaseClient, user);
        }

        return new Response("Not found", { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});

async function handleGetRooms(req: Request, supabase: any, url: URL) {
    const city = url.searchParams.get("city");
    const hotelId = url.searchParams.get("hotel_id");
    const guests = parseInt(url.searchParams.get("guests") || "0");
    const checkIn = url.searchParams.get("check_in");
    const checkOut = url.searchParams.get("check_out");

    let query = supabase.from("rooms").select("*, hotels(name, city)");

    if (city) query = query.ilike("hotels.city", `%${city}%`); // Note: Filtering on joined table needs !inner usually or specific syntax. 
    // Supabase filtering on foreign tables: 'hotels!inner(city)' to filter rooms by hotel city.
    // If just filtering rooms, standard. 
    // Let's assume passed hotel_id for simplicity or fix the join filter.

    // Better approach for city: Filter hotels first or use inner join syntax.
    if (city) {
        query = supabase.from("rooms").select("*, hotels!inner(name, city)").ilike("hotels.city", `%${city}%`);
    } else if (hotelId) {
        query = query.eq("hotel_id", hotelId);
    }

    if (guests > 0) {
        query = query.gte("capacity", guests);
    }

    const { data: rooms, error } = await query;
    if (error) throw error;

    if (checkIn && checkOut) {
        // Filter unavailable rooms in memory or via complex query. 
        // For 'simple' requirement, simple memory filtering is fine for small scale.
        // Get all confirmed bookings overlapping dates.
        const { data: busyBookings } = await supabase
            .from("bookings")
            .select("room_id")
            .eq("status", "confirmed")
            .lt("check_in", checkOut)
            .gt("check_out", checkIn);

        const busyRoomIds = new Set(busyBookings?.map((b: any) => b.room_id));
        const availableRooms = rooms.filter((r: any) => !busyRoomIds.has(r.id));

        return new Response(JSON.stringify(availableRooms), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(rooms), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleGetBookings(req: Request, supabase: any, user: any) {
    const { data, error } = await supabase
        .from("bookings")
        .select("*, rooms(name, hotel_id, hotels(name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleCreateBooking(req: Request, supabase: any, user: any) {
    const { room_id, check_in, check_out } = await req.json();
    if (!room_id || !check_in || !check_out) throw new Error("Missing fields");

    // 1. Calculate nights & price
    const start = new Date(check_in);
    const end = new Date(check_out);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (nights < 1) throw new Error("Invalid dates");

    const { data: room, error: roomError } = await supabase.from("rooms").select("*").eq("id", room_id).single();
    if (roomError || !room) throw new Error("Room not found");

    const totalAmount = nights * room.price_per_night;

    // 2. Validate Overlap (Pre-check)
    const { data: existing } = await supabase
        .from("bookings")
        .select("id")
        .eq("room_id", room_id)
        .eq("status", "confirmed")
        .lt("check_in", check_out)
        .gt("check_out", check_in);

    if (existing && existing.length > 0) throw new Error("Room unavailable for dates");

    // 3. Insert
    const { data: booking, error: insertError } = await supabase
        .from("bookings")
        .insert({
            user_id: user.id,
            room_id,
            check_in,
            check_out,
            nights,
            total_amount: totalAmount,
            currency: room.currency,
            status: "pending"
        })
        .select()
        .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify(booking), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleMarkRead(req: Request, supabase: any, user: any) {
    // Mark all as read or specific? Request implies general "mark-read". 
    // Let's assume mark all for simplicity or accept body.
    let body = {};
    try { body = await req.json(); } catch { }

    let query = supabase.from("notifications").update({ read: true }).eq("user_id", user.id);

    if (body.notification_id) {
        query = query.eq("id", body.notification_id);
    }

    const { error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
