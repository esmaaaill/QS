/**
 * Seed a Supabase auth user for local testing.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/register-supabase-user.js
 * Falls back to SUPABASE_ANON_KEY when service key is not available (email confirmation may still be required).
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from .env if present
dotenv.config({ path: path.join(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const DEFAULT_EMAIL = process.env.SEED_USER_EMAIL || 'esmaaail0110@gmail.com';
const DEFAULT_PASSWORD = process.env.SEED_USER_PASSWORD || '123456';
const DEFAULT_NAME = process.env.SEED_USER_NAME || 'Esmail';

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL. Add it to your environment or .env file.');
  process.exit(1);
}

if (!SERVICE_ROLE_KEY && !ANON_KEY) {
  console.error('Provide SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY.');
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY);

async function ensureUser() {
  const email = DEFAULT_EMAIL;
  const password = DEFAULT_PASSWORD;
  const name = DEFAULT_NAME;

  const usingServiceRole = Boolean(SERVICE_ROLE_KEY);

  if (usingServiceRole) {
    const existing = await client.auth.admin.getUserByEmail(email);
    if (existing?.data?.user) {
      console.log('User already exists in Supabase:', email);
      return;
    }

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      console.error('Failed to create user with service role key:', error.message);
      process.exit(1);
    }

    console.log('User created with service role key:', data.user?.id || data);
    return;
  }

  // Fallback: anon sign-up (may require email confirmation depending on project settings)
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    console.error('Failed to sign up with anon key:', error.message);
    process.exit(1);
  }

  console.log('User created with anon key (check email confirmation settings):', data.user?.id || data);
}

ensureUser().catch((err) => {
  console.error('Unexpected error while creating Supabase user:', err);
  process.exit(1);
});
