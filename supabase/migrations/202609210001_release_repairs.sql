-- v0.6.0: additive repair. Apply after the previous migrations in staging first.
begin;
alter table public.bookings add column if not exists client_request_id uuid;
alter table public.bookings add column if not exists payment_proof_path text not null default '';
create unique index if not exists bookings_client_request on public.bookings(user_id, client_request_id) where client_request_id is not null;

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

create or replace function public.create_booking(input jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_service public.services%rowtype;
  result public.bookings%rowtype;
  requested_add_ons jsonb := coalesce(input -> 'addOns', '[]'::jsonb);
  accepted_add_ons jsonb;
  add_on_total numeric := 0;
  requested_id uuid := nullif(input ->> 'requestId', '')::uuid;
  requested_date date;
  requested_time time;
  requested_mode text := nullif(trim(input ->> 'serviceMode'), '');
begin
  if auth.uid() is null then raise exception 'Sign in before booking.'; end if;
  if requested_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || requested_id::text, 0));
    select * into result from public.bookings where user_id = auth.uid() and client_request_id = requested_id;
    if found then return result; end if;
  end if;
  select * into selected_service
  from public.services
  where id = nullif(trim(input ->> 'serviceId'), '') and enabled = true;
  if not found then raise exception 'The selected service is unavailable.'; end if;

  if requested_mode is null or requested_mode not in ('bay', 'mobile') then raise exception 'Invalid service type.'; end if;
  requested_date := (input ->> 'date')::date;
  requested_time := (input ->> 'time')::time;
  if requested_date is null or requested_time is null then raise exception 'Appointment date and time are required.'; end if;
  if requested_date <= (now() at time zone 'America/Guyana')::date then raise exception 'Choose an appointment from tomorrow onwards.'; end if;
  if requested_time not in ('08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time) then raise exception 'Choose an offered appointment time.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('schedule:' || requested_date::text, 0));
  if jsonb_typeof(requested_add_ons) <> 'array' then raise exception 'Invalid add-ons.'; end if;
  if exists (select 1 from jsonb_array_elements_text(requested_add_ons) chosen where not exists (select 1 from jsonb_array_elements(selected_service.add_ons) a where a ->> 'id' = chosen)) then raise exception 'An add-on changed. Refresh the service before booking.'; end if;
  if coalesce(input ->> 'phone','') !~ '^[+0-9() .-]+$' or length(regexp_replace(coalesce(input ->> 'phone',''), '[^0-9]', '', 'g')) not between 7 and 15 then raise exception 'Enter a valid telephone number.'; end if;
  if nullif(trim(input ->> 'name'), '') is null then raise exception 'Customer name is required.'; end if;
  if nullif(trim(input ->> 'phone'), '') is null then raise exception 'Telephone is required.'; end if;
  if nullif(trim(input ->> 'vehicle'), '') is null then raise exception 'Vehicle is required.'; end if;
  if nullif(trim(input ->> 'plate'), '') is null then raise exception 'Registration is required.'; end if;
  if requested_mode = 'mobile' and nullif(trim(input ->> 'location'), '') is null then raise exception 'Location is required.'; end if;
  if requested_mode = 'mobile' and coalesce((input ->> 'waterConfirmed')::boolean, false) = false then raise exception 'Confirm that water is available.'; end if;

  if exists (
    select 1 from public.availability_overrides
    where service_date = requested_date and service_time = requested_time and status = 'blocked'
  ) then raise exception 'That appointment time has been blocked.'; end if;
  if exists (
    select 1 from public.bookings
    where service_date = requested_date and service_time = requested_time and status <> 'Cancelled' and walk_in = false
  ) then raise exception 'That appointment time was just booked. Choose another time.'; end if;

  select
    coalesce(jsonb_agg(add_on ->> 'id'), '[]'::jsonb),
    coalesce(sum((add_on ->> 'price')::numeric), 0)
  into accepted_add_ons, add_on_total
  from jsonb_array_elements(selected_service.add_ons) add_on
  where add_on ->> 'id' in (select jsonb_array_elements_text(requested_add_ons));

  insert into public.bookings (
    reference, user_id, service_id, service_name, add_ons, service_mode, service_date, service_time,
    customer_name, customer_phone, customer_email, vehicle, plate, location, location_pin,
    water_confirmed, notes, total, status, client_request_id
  ) values (
    'CT-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 5)),
    auth.uid(), selected_service.id, selected_service.name, accepted_add_ons, requested_mode, requested_date, requested_time,
    trim(input ->> 'name'), trim(input ->> 'phone'), coalesce(trim(input ->> 'email'), ''),
    trim(input ->> 'vehicle'), upper(trim(input ->> 'plate')),
    case when requested_mode = 'mobile' then trim(input ->> 'location') else '' end,
    coalesce(trim(input ->> 'locationPin'), ''),
    requested_mode = 'mobile' and coalesce((input ->> 'waterConfirmed')::boolean, false),
    coalesce(trim(input ->> 'notes'), ''), selected_service.price + add_on_total, 'Pending confirmation', requested_id
  ) returning * into result;

  return result;
exception
  when unique_violation then raise exception 'That appointment time was just booked. Choose another time.';
end;
$$;

revoke all on function public.create_booking(jsonb) from public;
grant execute on function public.create_booking(jsonb) to authenticated;


-- Enforce appointment invariants on admin writes too, while preserving walk-ins.
create or replace function public.guard_booking_schedule()
returns trigger language plpgsql set search_path = public as $$
begin
  if not new.walk_in then
    if new.service_date is null or new.service_time is null then raise exception 'An appointment needs a date and time.'; end if;
    if new.service_time not in ('08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time) then raise exception 'Choose an offered appointment time.'; end if;
    if tg_op = 'INSERT' or new.service_date is distinct from old.service_date or new.service_time is distinct from old.service_time then
      if new.service_date <= (now() at time zone 'America/Guyana')::date then raise exception 'Choose an appointment from tomorrow onwards.'; end if;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('schedule:' || new.service_date::text, 0));
    if new.status <> 'Cancelled' and exists (select 1 from public.availability_overrides where service_date = new.service_date and service_time = new.service_time and status = 'blocked') then raise exception 'This appointment time is blocked.'; end if;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.receipts where booking_id = old.id) then
    if new.total is distinct from old.total or new.service_id is distinct from old.service_id or new.service_name is distinct from old.service_name or new.payment_method is distinct from old.payment_method or new.payment_status is distinct from old.payment_status or new.status is distinct from old.status then
      raise exception 'This transaction has a receipt. Use a reviewed adjustment process instead.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists guard_booking_schedule on public.bookings;
create trigger guard_booking_schedule before insert or update on public.bookings for each row execute function public.guard_booking_schedule();

create or replace function public.guard_availability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('schedule:' || new.service_date::text, 0));
  if new.status = 'blocked' and exists (select 1 from public.bookings where service_date = new.service_date and service_time = new.service_time and status <> 'Cancelled' and not walk_in) then raise exception 'Move or cancel the booking before blocking its slot.'; end if;
  return new;
end; $$;
drop trigger if exists guard_availability on public.availability_overrides;
create trigger guard_availability before insert or update on public.availability_overrides for each row execute function public.guard_availability();

create or replace function public.set_day_availability(requested_date date, requested_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if requested_date is null or requested_status is null or requested_status not in ('open','blocked') then raise exception 'Invalid schedule change.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('schedule:' || requested_date::text, 0));
  insert into public.availability_overrides(service_date, service_time, status, updated_by)
  select requested_date, slot, requested_status, auth.uid()
  from unnest(array['08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time]) slot
  on conflict(service_date, service_time) do update set status = excluded.status, updated_by = auth.uid(), updated_at = now();
end; $$;
revoke all on function public.set_day_availability(date,text) from public, anon;
grant execute on function public.set_day_availability(date,text) to authenticated;

create or replace function public.save_public_settings(settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if exists (select 1 from unnest(array['business_name','mmg_account_name','mmg_number']) k where nullif(trim(settings ->> k),'') is null) then raise exception 'Complete all public settings.'; end if;
  insert into public.app_settings(key,value,is_public)
  select k, settings -> k, true from unnest(array['business_name','mmg_account_name','mmg_number']) k
  on conflict(key) do update set value = excluded.value, is_public = true, updated_at = now();
end; $$;
revoke all on function public.save_public_settings(jsonb) from public, anon;
grant execute on function public.save_public_settings(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "payment proof owner insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.bookings b where b.id::text = (storage.foldername(name))[2] and b.user_id = auth.uid() and b.status not in ('Completed','Cancelled') and b.payment_status <> 'Paid')
);
create policy "payment proof authorised read" on storage.objects for select to authenticated using (
  bucket_id = 'payment-proofs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.is_admin() and exists (select 1 from public.bookings b where b.payment_proof_path = name))
  )
);
-- No client overwrite or delete policy: submitted proof remains immutable.
-- Orphan cleanup is a privileged retention task after checking booking links.

create or replace function public.update_my_booking(input jsonb)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  current_booking public.bookings%rowtype;
  requested_action text := trim(input ->> 'action');
  proof_path text := coalesce(trim(input ->> 'paymentProofPath'), '');
begin
  if auth.uid() is null then raise exception 'Sign in before changing a booking.'; end if;
  select * into current_booking from public.bookings where reference = trim(input ->> 'reference') and user_id = auth.uid() for update;
  if not found then raise exception 'Booking not found for this account.'; end if;
  if current_booking.status in ('Completed','Cancelled') then raise exception 'This booking can no longer be changed.'; end if;
  if requested_action = 'submit_payment' then
    if current_booking.payment_status = 'Paid' then raise exception 'This payment is already verified.'; end if;
    if nullif(trim(input ->> 'paymentReference'),'') is null and proof_path = '' then raise exception 'Add an MMG reference or upload a proof image.'; end if;
    if proof_path <> '' then
      if split_part(proof_path,'/',1) <> auth.uid()::text or split_part(proof_path,'/',2) <> current_booking.id::text
        or not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = proof_path) then raise exception 'Proof image is not stored for this booking.'; end if;
    end if;
    update public.bookings set payment_method='MMG', payment_status='Pending review',
      payment_reference=coalesce(trim(input ->> 'paymentReference'),''),
      payment_proof_path=proof_path,
      payment_proof_name=case when proof_path <> '' then coalesce(trim(input ->> 'paymentProofName'),'Proof image') else '' end,
      updated_at=now()
    where id=current_booking.id returning * into current_booking;
  elsif requested_action in ('request_reschedule','request_cancel') then
    update public.bookings set change_request=case when requested_action='request_cancel' then 'Cancellation requested - awaiting admin review' else 'Reschedule requested - awaiting admin review' end, updated_at=now()
    where id=current_booking.id returning * into current_booking;
  else raise exception 'That customer action is not permitted.';
  end if;
  return current_booking;
end; $$;
revoke all on function public.update_my_booking(jsonb) from public, anon;
grant execute on function public.update_my_booking(jsonb) to authenticated;
-- Customer availability uses the minimal RPC, not administrator metadata rows.
drop policy if exists "availability public select" on public.availability_overrides;
create policy "availability admin select" on public.availability_overrides for select to authenticated using (public.is_admin());

create or replace function public.guard_profile_login_email()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.email is distinct from old.email then
    raise exception 'Change the login email through the verified authentication workflow.';
  end if;
  return new;
end; $$;
create trigger guard_profile_login_email before update on public.profiles for each row execute function public.guard_profile_login_email();
commit;
