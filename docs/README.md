# Hotel Booking Backend (Supabase + PayMob)

This project implements a simple, secure, and responsive backend for a hotel booking system using Supabase and PayMob.

## Features
- **Supabase Auth**: User management (Customers/Admins).
- **Database**: Postgres with Row Level Security (RLS).
- **Edge Functions**: TypeScript functions for Payment & Booking logic.
- **PayMob Integration**: Seamless payment flow (Initiate -> IFrame -> Webhook -> Confirmation).

## Structure
- `supabase/migrations/`: SQL Migrations (Schema + RLS).
- `supabase/functions/paymob-initiate/`: Generates PayMob payment keys.
- `supabase/functions/paymob-webhook/`: Handles payment callbacks.
- `supabase/functions/bookings/`: Endpoints for search, booking creation, and notifications.

## Environment Variables
Create a `.env` file for local development or set these secrets in your Supabase Dashboard.

```env
# --- PayMob Secrets ---
# Get these from your PayMob Dashboard > Settings > API Keys
PAYMOB_API_KEY=PASTE_YOURS_HERE
PAYMOB_HMAC_SECRET=PASTE_YOURS_HERE
PAYMOB_INTEGRATION_ID=PASTE_YOURS_HERE
PAYMOB_IFRAME_ID=PASTE_YOURS_HERE

# --- Supabase Secrets ---
# Get these from: supabase status (local) or Project Settings > API
SUPABASE_URL=PASTE_YOURS_HERE
SUPABASE_ANON_KEY=PASTE_YOURS_HERE
SUPABASE_SERVICE_ROLE_KEY=PASTE_YOURS_HERE 
# WARNING: SERVICE_ROLE_KEY gives full access. Keep it safe. 
# It is used by the Webhook to update payment status securely.

# --- Optional Email ---
EMAIL_PROVIDER_API_KEY=PASTE_YOURS_HERE
```

## Setup & Deployment

1. **Database Migration**
   Apply the schema and RLS policies:
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push
   ```
   *Locally:* `supabase start` handles migrations automatically.

2. **Deploy Functions**
   ```bash
   supabase functions deploy paymob-initiate --no-verify-jwt
   supabase functions deploy paymob-webhook --no-verify-jwt
   supabase functions deploy bookings --no-verify-jwt
   ```
   *Note: Authentication is handled inside the functions or via headers.*

3. **Configure PayMob Webhook**
   In PayMob Dashboard:
   - Go to **Developers > Transaction Webhooks**.
   - Add a new endpoint: `https://<project-ref>.supabase.co/functions/v1/paymob-webhook`
   - Method: `POST` (or GET if using Transaction Response Callback, but code supports JSON body for Webhook).

4. **Frontend Configuration**
   - Open `assets/config.js` and set your Supabase values:
     ```javascript
     const SUPABASE_URL = "https://your-project.supabase.co";
     const SUPABASE_KEY = "your-anon-key";
     ```

## API Cheatsheet

### 1. Initiate Payment
**POST** `/functions/v1/paymob-initiate`
- **Headers**: `Authorization: Bearer <USER_JWT>`
- **Body**: `{ "booking_id": "uuid" }`
- **Response**: `{ "payment_key": "...", "iframe_url": "..." }`

### 2. Search Rooms
**GET** `/functions/v1/bookings/rooms?city=Cairo&check_in=2024-01-01&check_out=2024-01-05`
- Returns confirmed-available rooms.

### 3. Create Booking
**POST** `/functions/v1/bookings`
- **Headers**: `Authorization: Bearer <USER_JWT>`
- **Body**: `{ "room_id": "...", "check_in": "...", "check_out": "..." }`
- **Response**: Created booking object (status: pending).

### 4. Get My Bookings
**GET** `/functions/v1/bookings`
- **Headers**: `Authorization: Bearer <USER_JWT>`
