-- Run once in the Supabase SQL editor as project owner.
-- Replace the placeholder with the auth user UUID of the verified intended owner.
-- Do not use email or editable user metadata to grant administrator privileges.
do $$
declare target uuid := '00000000-0000-0000-0000-000000000000';
begin
  if target = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set the verified owner auth user UUID before running';
  end if;
  update public.profiles set role = 'admin', updated_at = now() where user_id = target;
  if not found then raise exception 'No profile exists for the selected user'; end if;
end $$;
