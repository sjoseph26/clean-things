-- v0.6.9 targeted tester repair. Does not activate administrator MFA.
-- Additive to the observed production schema; also compatible with full repair staging.
begin;
alter table public.bookings add column if not exists payment_proof_path text not null default '';

create or replace function public.appointment_times(requested_date date)
returns time[] language sql immutable set search_path = public as $$
  select case when requested_date is null then array[]::time[] else
    array['08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time,'17:30'::time,'19:00'::time]
    || case when extract(isodow from requested_date) in (6,7) then array['20:00'::time,'21:00'::time] else array[]::time[] end end;
$$;
revoke all on function public.appointment_times(date) from public, anon;
grant execute on function public.appointment_times(date) to authenticated;

-- Preserve existing whole-day closures inferred by the previous six-slot client.
insert into public.availability_overrides(service_date,service_time,status)
select closed.service_date, offered, 'blocked'
from (select service_date from public.availability_overrides
  where status='blocked' and service_time in ('08:30','10:00','11:30','13:00','14:30','16:00')
  group by service_date having count(distinct service_time)=6) closed
cross join lateral unnest(public.appointment_times(closed.service_date)) offered
on conflict(service_date,service_time) do nothing;

create or replace function public.appointment_availability(requested_date date)
returns table(service_time time, status text)
language sql stable security definer set search_path = public
as $$
  select slot,
    case when exists (select 1 from public.bookings b where b.service_date = requested_date and b.service_time = slot and b.status <> 'Cancelled' and not b.walk_in) then 'booked'
      when exists (select 1 from public.availability_overrides a where a.service_date = requested_date and a.service_time = slot and a.status = 'blocked') then 'blocked'
      else 'open' end
  from unnest(public.appointment_times(requested_date)) slot
  where auth.uid() is not null and requested_date is not null;
$$;
revoke all on function public.appointment_availability(date) from public, anon;
grant execute on function public.appointment_availability(date) to authenticated;

-- Retain all existing function behaviour while widening the old fixed-list checks.
do $migration$
declare signature text; definition text; revised text;
begin
  foreach signature in array array['public.create_booking(jsonb)','public.guard_booking_schedule()'] loop
    if to_regprocedure(signature) is not null then
      definition := pg_get_functiondef(to_regprocedure(signature));
      revised := replace(definition, $old$requested_time not in ('08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time)$old$, $new$not (requested_time = any(public.appointment_times(requested_date)))$new$);
      revised := replace(revised, $old$new.service_time not in ('08:30'::time,'10:00'::time,'11:30'::time,'13:00'::time,'14:30'::time,'16:00'::time)$old$, $new$not (new.service_time = any(public.appointment_times(new.service_date)))$new$);
      if revised <> definition then execute revised; end if;
    end if;
  end loop;
end;
$migration$;

-- Also enforce the offered hours on the older live schema and direct admin edits.
create or replace function public.guard_offered_booking_time()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.walk_in then
    perform pg_advisory_xact_lock(hashtextextended('schedule:' || new.service_date::text, 0));
    if tg_op = 'INSERT' or new.service_date is distinct from old.service_date
      or new.service_time is distinct from old.service_time or new.walk_in is distinct from old.walk_in
      or (old.status = 'Cancelled' and new.status <> 'Cancelled') then
      if new.service_date is null or new.service_time is null
        or not (new.service_time = any(public.appointment_times(new.service_date))) then
        raise exception 'Choose an offered appointment time.';
      end if;
      if new.status <> 'Cancelled' and exists(select 1 from public.availability_overrides a
        where a.service_date = new.service_date and a.service_time = new.service_time and a.status = 'blocked') then
        raise exception 'This appointment time is blocked.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_offered_booking_time on public.bookings;
create trigger guard_offered_booking_time before insert or update on public.bookings
for each row execute function public.guard_offered_booking_time();
revoke all on function public.guard_offered_booking_time() from public, anon, authenticated;

create or replace function public.set_day_availability(requested_date date, requested_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if requested_date is null or requested_status is null or requested_status not in ('open','blocked') then raise exception 'Invalid schedule change.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('schedule:' || requested_date::text, 0));
  if requested_status = 'blocked' and exists (select 1 from public.bookings where service_date = requested_date and status <> 'Cancelled' and not walk_in) then raise exception 'Move or cancel bookings before closing this day.'; end if;
  insert into public.availability_overrides(service_date, service_time, status, updated_by)
  select requested_date, slot, requested_status, auth.uid()
  from unnest(public.appointment_times(requested_date)) slot
  on conflict(service_date, service_time) do update set status = excluded.status, updated_by = auth.uid(), updated_at = now();
end; $$;
revoke all on function public.set_day_availability(date,text) from public, anon;
grant execute on function public.set_day_availability(date,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "payment proof owner insert" on storage.objects;
create policy "payment proof owner insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.bookings b where b.id::text = (storage.foldername(name))[2] and b.user_id = auth.uid() and b.status not in ('Completed','Cancelled') and b.payment_status <> 'Paid')
);
drop policy if exists "payment proof authorised read" on storage.objects;
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

notify pgrst, 'reload schema';
commit;
