-- Enable pgcrypto for gen_random_uuid if not already enabled (usually standard in Supabase)
create extension if not exists "pgcrypto";

--------------------------------------------------------------------------------
-- 1. TABLES
--------------------------------------------------------------------------------

-- A) profiles (extends auth.users)
-- We'll assume a trigger handles creation on auth.users insert, OR the client creates it.
-- For simplicity in this script, we just define the table.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text check (role in ('customer', 'admin')) default 'customer',
  created_at timestamptz default now()
);

-- B) hotels
create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  address text,
  description text,
  created_at timestamptz default now()
);

-- C) rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,
  name text not null,
  capacity int not null default 1,
  price_per_night numeric not null check (price_per_night >= 0),
  currency text not null default 'EGP',
  created_at timestamptz default now()
);

-- D) bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  nights int not null check (nights > 0),
  total_amount numeric not null check (total_amount >= 0),
  currency text not null default 'EGP',
  status text check (status in ('pending', 'confirmed', 'cancelled')) default 'pending',
  created_at timestamptz default now(),
  constraint check_dates check (check_out > check_in)
);

-- E) payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade unique,
  provider text not null default 'paymob',
  provider_order_id text,
  provider_payment_key text,
  amount numeric not null check (amount >= 0),
  currency text not null default 'EGP',
  status text check (status in ('initiated', 'paid', 'failed')) default 'initiated',
  raw jsonb,
  created_at timestamptz default now()
);

-- F) notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz default now()
);

--------------------------------------------------------------------------------
-- 2. INDEXES
--------------------------------------------------------------------------------
create index idx_rooms_hotel_id on public.rooms(hotel_id);
create index idx_bookings_user_id on public.bookings(user_id);
create index idx_bookings_room_id on public.bookings(room_id);
create index idx_bookings_status on public.bookings(status);
create index idx_notifications_user_read on public.notifications(user_id, read);

--------------------------------------------------------------------------------
-- 3. RLS ENABLEMENT
--------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.hotels enable row level security;
alter table public.rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;

--------------------------------------------------------------------------------
-- 4. RLS POLICIES
--------------------------------------------------------------------------------

-- Helper function to check if user is admin
-- NOTE: In a real app, rely on Custom Claims or keep it simple with a join.
-- Performance warning: This performs a lookup. optimize if strict perf needed.
-- For this simple task, a subquery or join-check in policy is standard.
-- We will use direct USING clauses matching the requirements.

-- --- PROFILES ---
create policy "Users can view own profile" on public.profiles
for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

-- --- HOTELS ---
create policy "Public can read hotels" on public.hotels
for select using (true);

create policy "Admins can insert hotels" on public.hotels
for insert with check (exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
));

create policy "Admins can update hotels" on public.hotels
for update using (exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
));

create policy "Admins can delete hotels" on public.hotels
for delete using (exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
));

-- --- ROOMS ---
create policy "Public can read rooms" on public.rooms
for select using (true);

create policy "Admins can insert rooms" on public.rooms
for insert with check (exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
));

create policy "Admins can update rooms" on public.rooms
for update using (exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
));

create policy "Admins can delete rooms" on public.rooms
for delete using (exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
));

-- --- BOOKINGS ---
create policy "Users can read own bookings" on public.bookings
for select using (auth.uid() = user_id);

create policy "Users can insert own bookings" on public.bookings
for insert with check (auth.uid() = user_id);

-- Update: Backend service role (webhook) or User cancel if pending
-- Supabase Service Role usually bypasses RLS if using the service_role key.
-- But if we want to be explicit or if using a privileged user:
-- We'll allow users to cancel PENDING bookings.
create policy "Users can cancel pending bookings" on public.bookings
for update using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'cancelled');

-- Note: Service Role bypasses RLS by default, so we don't strictly need a policy for the webhook
-- if the webhook uses the service role key.

-- --- PAYMENTS ---
-- View: Own booking's payments
create policy "Users can view own payments" on public.payments
for select using (exists (
  select 1 from public.bookings
  where bookings.id = payments.booking_id
  and bookings.user_id = auth.uid()
));

-- Insert/Update: Service Role only (bypasses RLS) -> No policy needed for 'public' role.
-- If we need to strictly forbid public writes even if they tried:
-- No insert/update policies for 'public' means default deny. Correct.

-- --- NOTIFICATIONS ---
create policy "Users can read own notifications" on public.notifications
for select using (auth.uid() = user_id);

create policy "Users can mark own notifications read" on public.notifications
for update using (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 5. FUNCTIONS (Basic Constraints)
--------------------------------------------------------------------------------
-- Overlap Rule: "When creating booking, prevent overlapping CONFIRMED bookings for same room."
-- We can do this with a function and a trigger, or enforce it at the application level (Edge Function).
-- The prompt asks for "Overlap rule (basic)".
-- A database trigger is safest.

create or replace function check_booking_overlap()
returns trigger as $$
begin
  if NEW.status = 'confirmed' then
    if exists (
      select 1 from public.bookings
      where room_id = NEW.room_id
      and id != NEW.id
      and status = 'confirmed'
      and (
        (check_in < NEW.check_out and check_out > NEW.check_in)
      )
    ) then
      raise exception 'Room is already booked for these dates.';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_check_overlap
before insert or update on public.bookings
for each row execute function check_booking_overlap();
