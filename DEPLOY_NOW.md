# Quick Deployment Guide - Manual Setup

## ✅ What's Already Working
- **Frontend**: Configured with your Supabase credentials
- **Authentication**: Working perfectly (tested successfully)

## 🔧 What Needs to Be Done

### Step 1: Deploy Database Schema (5 minutes)

1. Go to: https://supabase.com/dashboard/project/uqdfmntewhttdnmwufuh/editor
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the entire contents of `supabase/migrations/20240101000000_initial_schema.sql`
5. Click **Run** (bottom right)
6. You should see: "Success. No rows returned"

### Step 2: Deploy Edge Functions (10 minutes)

#### Option A: Using Supabase CLI (Recommended)
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref uqdfmntewhttdnmwufuh

# Deploy all functions
supabase functions deploy paymob-initiate
supabase functions deploy paymob-webhook
supabase functions deploy bookings
```

#### Option B: Manual Deployment via Dashboard
1. Go to: https://supabase.com/dashboard/project/uqdfmntewhttdnmwufuh/functions
2. Click **Deploy a new function**
3. For each function (`paymob-initiate`, `paymob-webhook`, `bookings`):
   - Name: (function name)
   - Import method: Upload file
   - Upload: `supabase/functions/[function-name]/index.ts`
   - Click Deploy

### Step 3: Set Environment Secrets

1. Go to: https://supabase.com/dashboard/project/uqdfmntewhttdnmwufuh/settings/vault
2. Click **Secrets** tab
3. Add these secrets (click **New secret** for each):

```
PAYMOB_API_KEY = <YOUR_PAYMOB_API_KEY>

PAYMOB_HMAC_SECRET = <YOUR_PAYMOB_HMAC_SECRET>

PAYMOB_INTEGRATION_ID = 4927869

PAYMOB_IFRAME_ID = 964127
```

### Step 4: Verify Deployment

1. Go back to: http://localhost:3000/test-connection.html
2. Click **Test Database** - Should show "✓ Found X hotels"
3. Click **Test Functions** - Should show "✓ Functions deployed"

## 🎯 After Deployment

Your application will be fully functional:
- ✅ User Registration & Login
- ✅ Hotel & Room Browsing
- ✅ Booking Creation
- ✅ PayMob Payment Integration
- ✅ Webhook Confirmation
- ✅ Notifications

## 🚀 Test the Complete Flow

1. Open: http://localhost:3000
2. Click **Login** → Sign up with a new email
3. Search for hotels
4. Click **Reserve Now** on any hotel
5. Fill booking form
6. Payment iframe will load
7. Complete test payment
8. Booking status updates to "confirmed"

---

**Need Help?**
- Database issues: Check SQL Editor for errors
- Function issues: Check Function Logs in dashboard
- Payment issues: Verify PayMob secrets are correct
