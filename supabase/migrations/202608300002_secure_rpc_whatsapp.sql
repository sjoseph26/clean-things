create extension if not exists pg_net with schema extensions;

alter table public.notification_log
  drop constraint if exists notification_log_status_check;
alter table public.notification_log
  add constraint notification_log_status_check check (status in ('queued', 'sent', 'failed'));

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
  requested_date date;
  requested_time time;
  requested_mode text := nullif(trim(input ->> 'serviceMode'), '');
begin
  select * into selected_service
  from public.services
  where id = nullif(trim(input ->> 'serviceId'), '') and enabled = true;
  if not found then raise exception 'The selected service is unavailable.'; end if;

  if requested_mode not in ('bay', 'mobile') then raise exception 'Invalid service type.'; end if;
  requested_date := (input ->> 'date')::date;
  requested_time := (input ->> 'time')::time;
  if requested_date < current_date then raise exception 'Choose a future appointment date.'; end if;
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
    water_confirmed, notes, total, status
  ) values (
    'CT-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 5)),
    auth.uid(), selected_service.id, selected_service.name, accepted_add_ons, requested_mode, requested_date, requested_time,
    trim(input ->> 'name'), trim(input ->> 'phone'), coalesce(trim(input ->> 'email'), ''),
    trim(input ->> 'vehicle'), upper(trim(input ->> 'plate')),
    case when requested_mode = 'mobile' then trim(input ->> 'location') else '' end,
    coalesce(trim(input ->> 'locationPin'), ''),
    requested_mode = 'mobile' and coalesce((input ->> 'waterConfirmed')::boolean, false),
    coalesce(trim(input ->> 'notes'), ''), selected_service.price + add_on_total, 'Pending confirmation'
  ) returning * into result;

  return result;
exception
  when unique_violation then raise exception 'That appointment time was just booked. Choose another time.';
end;
$$;

revoke all on function public.create_booking(jsonb) from public;
grant execute on function public.create_booking(jsonb) to authenticated;

create or replace function public.update_my_booking(input jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  current_booking public.bookings%rowtype;
  requested_action text := trim(input ->> 'action');
begin
  if auth.uid() is null then raise exception 'Sign in before changing a booking.'; end if;
  select * into current_booking
  from public.bookings
  where reference = trim(input ->> 'reference') and user_id = auth.uid()
  for update;
  if not found then raise exception 'Booking not found for this account.'; end if;
  if current_booking.status in ('Completed', 'Cancelled') then raise exception 'This booking can no longer be changed.'; end if;

  if requested_action = 'submit_payment' then
    if nullif(trim(input ->> 'paymentReference'), '') is null and nullif(trim(input ->> 'paymentProofName'), '') is null then
      raise exception 'Add an MMG reference or proof filename.';
    end if;
    update public.bookings set
      payment_method = 'MMG', payment_status = 'Pending review',
      payment_reference = coalesce(trim(input ->> 'paymentReference'), ''),
      payment_proof_name = coalesce(trim(input ->> 'paymentProofName'), ''), updated_at = now()
    where id = current_booking.id returning * into current_booking;
  elsif requested_action = 'request_reschedule' then
    update public.bookings set change_request = 'Reschedule requested - awaiting admin review', updated_at = now()
    where id = current_booking.id returning * into current_booking;
  elsif requested_action = 'request_cancel' then
    update public.bookings set change_request = 'Cancellation requested - awaiting admin review', updated_at = now()
    where id = current_booking.id returning * into current_booking;
  else
    raise exception 'That customer action is not permitted.';
  end if;
  return current_booking;
end;
$$;

revoke all on function public.update_my_booking(jsonb) from public;
grant execute on function public.update_my_booking(jsonb) to authenticated;

create or replace function public.queue_booking_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  access_token text;
  phone_number_id text;
  destination text;
  graph_version text;
  template_name text;
  template_payload jsonb;
  request_id bigint;
begin
  select decrypted_secret into access_token from vault.decrypted_secrets where name = 'whatsapp_access_token' limit 1;
  select decrypted_secret into phone_number_id from vault.decrypted_secrets where name = 'whatsapp_phone_number_id' limit 1;
  select regexp_replace(decrypted_secret, '[^0-9]', '', 'g') into destination from vault.decrypted_secrets where name = 'whatsapp_to' limit 1;
  select decrypted_secret into graph_version from vault.decrypted_secrets where name = 'whatsapp_graph_version' limit 1;
  select decrypted_secret into template_name from vault.decrypted_secrets where name = 'whatsapp_template_name' limit 1;
  if access_token is null or phone_number_id is null or destination is null then return new; end if;
  graph_version := coalesce(nullif(graph_version, ''), 'v23.0');
  template_name := coalesce(nullif(template_name, ''), 'hello_world');

  template_payload := jsonb_build_object('name', template_name, 'language', jsonb_build_object('code', 'en_US'));
  if template_name <> 'hello_world' then
    template_payload := template_payload || jsonb_build_object('components', jsonb_build_array(
      jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', new.customer_name),
        jsonb_build_object('type', 'text', 'text', new.service_name),
        jsonb_build_object('type', 'text', 'text', new.service_date::text || ' ' || left(new.service_time::text, 5)),
        jsonb_build_object('type', 'text', 'text', 'GYD ' || trim(to_char(new.total, 'FM999G999G990D00'))),
        jsonb_build_object('type', 'text', 'text', new.reference)
      ))
    ));
  end if;

  select net.http_post(
    url := 'https://graph.facebook.com/' || graph_version || '/' || phone_number_id || '/messages',
    headers := jsonb_build_object('Authorization', 'Bearer ' || access_token, 'Content-Type', 'application/json'),
    body := jsonb_build_object('messaging_product', 'whatsapp', 'to', destination, 'type', 'template', 'template', template_payload),
    timeout_milliseconds := 5000
  ) into request_id;
  insert into public.notification_log (booking_id, destination_hint, status, provider_message_id)
  values (new.id, right(destination, 4), 'queued', request_id::text);
  return new;
exception when others then
  insert into public.notification_log (booking_id, destination_hint, status, error_message)
  values (new.id, right(coalesce(destination, ''), 4), 'failed', sqlerrm);
  return new;
end;
$$;

drop trigger if exists queue_whatsapp_after_booking on public.bookings;
create trigger queue_whatsapp_after_booking
  after insert on public.bookings
  for each row when (new.walk_in = false)
  execute function public.queue_booking_whatsapp();
