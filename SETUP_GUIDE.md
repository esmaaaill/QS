# Quick Stay - Complete Setup Guide

## Prerequisites
- Node.js installed
- Supabase CLI installed: `npm install -g supabase`
- Git installed
- PayMob Accept account (for Egypt payments)

## Step 1: Supabase Setup

### 1.1 Create Supabase Project
1. Go to https://supabase.com and create a new project
2. Wait for the project to finish provisioning
3. Note your project URL and anon key from Settings > API

### 1.2 Configure Local Environment
```bash
# Initialize Supabase locally (optional for local development)
supabase init

# Link to your remote project
supabase link --project-ref your-project-ref

# Push database migrations
supabase db push
```

### 1.3 Deploy Edge Functions
```bash
# Deploy all functions
supabase functions deploy paymob-initiate
supabase functions deploy paymob-webhook  
supabase functions deploy bookings

# Set environment secrets
supabase secrets set PAYMOB_API_KEY=your_api_key
supabase secrets set PAYMOB_HMAC_SECRET=your_hmac_secret
supabase secrets set PAYMOB_INTEGRATION_ID=your_integration_id
supabase secrets set PAYMOB_IFRAME_ID=your_iframe_id
```

## Step 2: PayMob Setup

### 2.1 Create PayMob Account
1. Register at https://accept.paymob.com
2. Complete KYC verification
3. Get your API credentials from Developer Settings

### 2.2 Configure Webhook
1. In PayMob Dashboard, go to Developers > Webhooks
2. Add webhook URL: `https://your-project.supabase.co/functions/v1/paymob-webhook`
3. Enable transaction processed events

## Step 3: Frontend Configuration

### 3.1 Update config.js
Edit `assets/config.js` with your credentials:
```javascript
const SUPABASE_URL = "https://your-project-id.supabase.co";
const SUPABASE_KEY = "your-anon-key";
```

### 3.2 Install Dependencies
```bash
npm install
```

## Step 4: Database Seeding (Optional)

### 4.1 Create Admin User
Use Supabase Dashboard or SQL:
```sql
-- Create admin profile after signing up
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-admin@email.com';
```

### 4.2 Add Sample Hotels
```sql
-- Insert sample hotel
INSERT INTO hotels (name, city, address, description) 
VALUES 
  ('Laguna Shoreline Resort', 'Malibu', '123 Beach Blvd', 'Luxury beachfront resort'),
  ('Skyline Signature', 'Dubai', '456 Sheikh Zayed Rd', 'Premium city hotel'),
  ('Summit Chalet', 'Whistler', '789 Mountain Way', 'Cozy mountain retreat');

-- Insert sample rooms
INSERT INTO rooms (hotel_id, name, capacity, price_per_night, currency)
SELECT 
  h.id,
  'Deluxe Suite',
  2,
  CASE 
    WHEN h.name = 'Laguna Shoreline Resort' THEN 260
    WHEN h.name = 'Skyline Signature' THEN 340
    WHEN h.name = 'Summit Chalet' THEN 210
  END,
  CASE 
    WHEN h.city = 'Dubai' THEN 'AED'
    ELSE 'USD'
  END
FROM hotels h;
```

## Step 5: Testing Flow

### 5.1 Start Local Server
```bash
npm start
# Server runs on http://localhost:3000
```

### 5.2 Test Authentication
1. Navigate to http://localhost:3000/booking.html
2. Sign up with email/password
3. Verify user created in Supabase Dashboard > Authentication

### 5.3 Test Booking Flow
1. Search for rooms on homepage
2. Select a room and dates
3. Click "Reserve Now"
4. Complete booking form
5. Verify booking created in Supabase Dashboard > Table Editor > bookings

### 5.4 Test Payment Flow
1. After creating booking, click "Pay Now"
2. System calls `paymob-initiate` edge function
3. PayMob iframe should load
4. Complete test payment (use PayMob test cards)
5. Webhook updates booking status to 'confirmed'
6. Check notifications table for confirmation message

## Step 6: Troubleshooting

### Common Issues

**Supabase Connection Error**
- Verify SUPABASE_URL and SUPABASE_KEY in config.js
- Check browser console for CORS errors
- Ensure Supabase project is active

**Edge Function Errors**
- Check function logs: `supabase functions logs paymob-initiate`
- Verify environment secrets are set
- Test function directly: `supabase functions invoke paymob-initiate --body '{"booking_id":"test"}'`

**PayMob Integration Issues**
- Verify API credentials are correct
- Check webhook is configured with correct URL
- Review PayMob dashboard for transaction logs
- Ensure HMAC secret matches

**Database Errors**
- Check RLS policies are enabled
- Verify user has correct role
- Review Supabase logs in Dashboard

## Step 7: Production Deployment

### 7.1 Environment Variables
Set production values for:
- Supabase URL and keys
- PayMob production credentials
- Email provider API keys (optional)

### 7.2 Security Checklist
- [ ] All secrets stored in environment variables
- [ ] RLS policies tested and enabled
- [ ] CORS configured correctly
- [ ] PayMob webhook uses HTTPS
- [ ] Test transactions verified

### 7.3 Go Live
1. Update config.js with production Supabase URL
2. Deploy frontend to hosting (Vercel, Netlify, etc.)
3. Update PayMob webhook to production URL
4. Test complete flow in production
5. Monitor logs and transactions

## Support
- Supabase Docs: https://supabase.com/docs
- PayMob Docs: https://docs.paymob.com
- Project Issues: Check browser console and Supabase logs
