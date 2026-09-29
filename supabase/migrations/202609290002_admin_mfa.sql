-- Staged v0.6.4 rollout: install the MFA-capable app on every admin device first.
-- This changes every existing RLS policy/RPC which delegates to public.is_admin().
begin;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified' and f.factor_type = 'totp');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- No factor secrets or other-account details are returned. A password-only admin
-- can read their own profile and this status so they can enrol before accessing data.
create or replace function public.admin_mfa_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enforced', true,
    'required', exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'),
    'verified', public.is_admin()
  );
$$;
revoke all on function public.admin_mfa_status() from public, anon;
grant execute on function public.admin_mfa_status() to authenticated;
notify pgrst, 'reload schema';
commit;
