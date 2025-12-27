// Basic Express server that proxies authentication and data access to Supabase.
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase environment variables are missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.');
}

const supabasePublic = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Use the service role if available so the backend can perform admin operations; fall back to anon for public calls.
const supabaseAdmin = SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)
  : null;

app.use(express.json());

// Serve the existing static site assets from the repository root.
app.use(express.static(path.join(__dirname)));

function ensureSupabase(res) {
  if (!supabasePublic || !supabaseAdmin) {
    res.status(500).json({ message: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' });
    return null;
  }
  return { supabasePublic, supabaseAdmin };
}

async function requireSupabaseAuth(req, res, next) {
  const clients = ensureSupabase(res);
  if (!clients) return;

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing bearer token.' });
  }

  const token = header.replace('Bearer ', '');
  const { data, error } = await clients.supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ message: 'Invalid or expired Supabase token.' });
  }

  req.user = data.user;
  next();
}

// API: register a new user account in Supabase Auth.
app.post('/api/auth/signup', async (req, res) => {
  const clients = ensureSupabase(res);
  if (!clients) return;

  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  try {
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await clients.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (error) {
        return res.status(400).json({ message: error.message });
      }

      // Automatically sign in with the public client to return a session token for the frontend.
      const { data: sessionData, error: loginError } = await clients.supabasePublic.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        return res.status(201).json({
          message: 'Account created, but automatic login failed. Please sign in manually.',
          user: { id: data.user?.id, email: data.user?.email, name },
        });
      }

      return res.status(201).json({
        message: 'Account created successfully in Supabase.',
        token: sessionData.session?.access_token,
        user: {
          id: data.user?.id,
          email: data.user?.email,
          name: name || data.user?.user_metadata?.name,
        },
      });
    }

    const { data, error } = await clients.supabasePublic.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({
      message: data.session ? 'Account created and signed in via Supabase.' : 'Account created. Please confirm your email.',
      token: data.session?.access_token,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        name: name || data.user?.user_metadata?.name,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create account with Supabase.', details: error.message });
  }
});

// API: log in with Supabase Auth using email/password.
app.post('/api/auth/login', async (req, res) => {
  const clients = ensureSupabase(res);
  if (!clients) return;

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const { data, error } = await clients.supabasePublic.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return res.status(401).json({ message: error?.message || 'Invalid Supabase credentials.' });
  }

  return res.json({
    message: 'Login successful.',
    token: data.session.access_token,
    user: {
      id: data.session.user.id,
      email: data.session.user.email,
      name: data.session.user.user_metadata?.name,
    },
  });
});

// API: protected route to verify the Supabase token.
app.get('/api/auth/me', requireSupabaseAuth, (req, res) => {
  return res.json({
    message: 'Token is valid.',
    user: { id: req.user.id, email: req.user.email, name: req.user.user_metadata?.name },
  });
});

// API: public helper to fetch available rooms from Supabase (supports basic filters).
app.get('/api/rooms', async (req, res) => {
  const clients = ensureSupabase(res);
  if (!clients) return;

  const { city, guests, hotel_id: hotelId, check_in: checkIn, check_out: checkOut } = req.query;

  try {
    let query = clients.supabasePublic.from('rooms').select('id, name, capacity, price_per_night, currency, hotel_id, hotels!inner(name, city)');

    if (city) {
      query = query.ilike('hotels.city', `%${city}%`);
    }

    if (hotelId) {
      query = query.eq('hotel_id', hotelId);
    }

    if (guests) {
      query = query.gte('capacity', Number(guests));
    }

    const { data: rooms, error } = await query;

    if (error) {
      return res.status(500).json({ message: 'Failed to load rooms from Supabase.', details: error.message });
    }

    let filteredRooms = rooms || [];

    if (checkIn && checkOut) {
      const { data: busy } = await clients.supabasePublic
        .from('bookings')
        .select('room_id')
        .eq('status', 'confirmed')
        .lt('check_in', checkOut)
        .gt('check_out', checkIn);

      const busySet = new Set((busy || []).map((b) => b.room_id));
      filteredRooms = filteredRooms.filter((room) => !busySet.has(room.id));
    }

    return res.json({ rooms: filteredRooms });
  } catch (error) {
    return res.status(500).json({ message: 'Unexpected error while reading rooms from Supabase.', details: error.message });
  }
});

// Fallback for unknown API routes to avoid serving index.html for API mistakes.
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

app.listen(PORT, () => {
  console.log(`Quick Stay server running on http://localhost:${PORT}`);
});
