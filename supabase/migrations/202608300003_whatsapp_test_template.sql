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
  graph_version := coalesce(nullif(graph_version, ''), 'v25.0');
  template_name := coalesce(nullif(template_name, ''), 'jaspers_market_order_confirmation_v1');

  template_payload := jsonb_build_object('name', template_name, 'language', jsonb_build_object('code', 'en_US'));
  if template_name = 'jaspers_market_order_confirmation_v1' then
    template_payload := template_payload || jsonb_build_object('components', jsonb_build_array(
      jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', new.customer_name),
        jsonb_build_object('type', 'text', 'text', new.reference),
        jsonb_build_object('type', 'text', 'text', to_char(new.service_date, 'Mon DD, YYYY'))
      ))
    ));
  elsif template_name <> 'hello_world' then
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
