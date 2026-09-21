create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  phone text not null default '',
  vehicle text not null default '',
  plate text not null default '',
  location text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  name text not null,
  icon text not null default '🫧',
  price numeric(12,2) not null check (price >= 0),
  duration text not null,
  description text not null default '',
  includes jsonb not null default '[]'::jsonb,
  add_ons jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  popular boolean not null default false,
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_overrides (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_time time not null,
  status text not null check (status in ('open', 'blocked')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(service_date, service_time)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  service_id text not null references public.services(id),
  service_name text not null,
  add_ons jsonb not null default '[]'::jsonb,
  service_mode text not null check (service_mode in ('bay', 'mobile')),
  service_date date,
  service_time time,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null default '',
  vehicle text not null,
  plate text not null,
  location text not null default '',
  location_pin text not null default '',
  water_confirmed boolean not null default false,
  notes text not null default '',
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'Pending confirmation' check (status in ('Pending confirmation', 'Confirmed', 'Completed', 'Cancelled')),
  payment_method text not null default 'Not selected',
  payment_status text not null default 'Not submitted',
  payment_reference text not null default '',
  payment_proof_name text not null default '',
  change_request text not null default '',
  walk_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists active_booking_slot
  on public.bookings(service_date, service_time)
  where status <> 'Cancelled' and walk_in = false;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique not null,
  booking_id uuid unique not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text not null,
  issued_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  channel text not null default 'whatsapp',
  destination_hint text not null default '',
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change account roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists protect_profile_role_change on public.profiles;
create trigger protect_profile_role_change
  before update of role on public.profiles
  for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.availability_overrides enable row level security;
alter table public.bookings enable row level security;
alter table public.receipts enable row level security;
alter table public.app_settings enable row level security;
alter table public.notification_log enable row level security;

create policy "profiles own select" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "profiles own update" on public.profiles for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "services public select" on public.services for select to anon, authenticated using (enabled or public.is_admin());
create policy "services admin insert" on public.services for insert to authenticated with check (public.is_admin());
create policy "services admin update" on public.services for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "services admin delete" on public.services for delete to authenticated using (public.is_admin());
create policy "availability public select" on public.availability_overrides for select to anon, authenticated using (true);
create policy "availability admin write" on public.availability_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "bookings own select" on public.bookings for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "bookings admin insert" on public.bookings for insert to authenticated with check (public.is_admin());
create policy "bookings admin update" on public.bookings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "bookings admin delete" on public.bookings for delete to authenticated using (public.is_admin());
create policy "receipts own select" on public.receipts for select to authenticated using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
create policy "receipts admin write" on public.receipts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "settings public select" on public.app_settings for select to anon, authenticated using (is_public or public.is_admin());
create policy "settings admin write" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "notifications admin select" on public.notification_log for select to authenticated using (public.is_admin());

insert into public.services (id, name, icon, price, duration, description, includes, add_ons, enabled, popular, display_order)
values
  ('essential', 'Essential Wash', '🚙', 3000, '40 min', 'A careful exterior wash, wheel rinse and hand dry.', '["Exterior wash","Wheel rinse","Hand dry"]', '[{"id":"tyre-shine","name":"Tyre shine","price":800,"description":"Clean, finished tyre appearance"},{"id":"interior-vacuum","name":"Interior vacuum","price":1500,"description":"Seats, mats and floor vacuum"}]', true, false, 1),
  ('complete', 'Complete Care', '✨', 5500, '70 min', 'Exterior care plus interior vacuum and dashboard wipe-down.', '["Exterior wash","Interior vacuum","Dashboard wipe","Tyre shine"]', '[{"id":"seat-shampoo","name":"Seat shampoo","price":3000,"description":"Deep fabric-seat cleaning"},{"id":"engine-bay","name":"Engine-bay clean","price":2500,"description":"Careful surface clean and finish"}]', true, true, 2),
  ('full-detail', 'Full Detail', '💎', 12000, '3 hrs', 'A deeper interior and exterior treatment for a complete refresh.', '["Deep interior clean","Exterior wash","Light polish","Tyre finish"]', '[{"id":"seat-shampoo","name":"Seat shampoo","price":3000,"description":"Deep fabric-seat cleaning"},{"id":"headlight-restore","name":"Headlight restoration","price":3500,"description":"Restore clarity to faded lenses"}]', true, false, 3)
on conflict (id) do nothing;

insert into public.app_settings (key, value, is_public)
values
  ('business_name', '"Clean Things"'::jsonb, true),
  ('mmg_account_name', '"Clean Things (Demo)"'::jsonb, true),
  ('mmg_number', '"000-0000"'::jsonb, true)
on conflict (key) do nothing;

create or replace function public.issue_paid_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Completed' and new.payment_status = 'Paid' then
    insert into public.receipts (receipt_number, booking_id, amount, payment_method)
    values ('RCT-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(new.id::text, 1, 4)), new.id, new.total, new.payment_method)
    on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_receipt_after_booking on public.bookings;
create trigger create_receipt_after_booking
  after insert or update of status, payment_status on public.bookings
  for each row execute function public.issue_paid_receipt();
