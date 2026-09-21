-- Require an authenticated account for every customer booking.
-- Existing bookings remain unchanged. Administrator-created walk-ins continue
-- to use the protected bookings table and are unaffected by this RPC grant.

revoke execute on function public.create_booking(jsonb) from anon;
revoke execute on function public.create_booking(jsonb) from public;
grant execute on function public.create_booking(jsonb) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.create_booking(jsonb)', 'execute') then
    raise exception 'Anonymous booking access is still enabled.';
  end if;
  if not has_function_privilege('authenticated', 'public.create_booking(jsonb)', 'execute') then
    raise exception 'Authenticated booking access was not granted.';
  end if;
end;
$$;
