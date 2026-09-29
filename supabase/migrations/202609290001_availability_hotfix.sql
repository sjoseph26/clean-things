-- Targeted repair for older live databases missing the availability RPC.
-- Does not modify bookings, profiles, payment data or table policies.
begin;
create or replace function public.appointment_availability(requested_date date)
returns table(service_time time, status text)
language sql stable security definer set search_path = public
as $$
  select slot,
    case when exists (select 1 from public.bookings b where b.service_date = requested_date and b.service_time = slot and b.status <> 'Cancelled' and not b.walk_in) then 'booked'
      when exists (select 1 from public.availability_overrides a where a.service_date = requested_date and a.service_time = slot and a.status = 'blocked') then 'blocked'
      else 'open' end
  from unnest(array['08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time]) slot
  where auth.uid() is not null and requested_date is not null;
$$;
revoke all on function public.appointment_availability(date) from public, anon;
grant execute on function public.appointment_availability(date) to authenticated;

notify pgrst, 'reload schema';
commit;
