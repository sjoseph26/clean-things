-- Allow Supabase API roles to reach the tables. Row-level security policies
-- still decide which rows each signed-in user may read or change.
grant usage on schema public to anon, authenticated;

grant select on table public.services to anon, authenticated;
grant select on table public.availability_overrides to anon, authenticated;
grant select on table public.app_settings to anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant insert, update, delete on table public.services to authenticated;
grant insert, update, delete on table public.availability_overrides to authenticated;
grant select, insert, update, delete on table public.bookings to authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;
grant insert, update, delete on table public.app_settings to authenticated;
grant select on table public.notification_log to authenticated;

-- Administrator assignment is an explicit operator action; see ../seed-admin.sql.
