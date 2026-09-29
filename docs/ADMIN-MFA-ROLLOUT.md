# Administrator two-step verification rollout — v0.6.4

Status: implemented and tested locally; **not enabled in the live database**. v0.6.10 combines biometric sign-in and the tester fixes while preserving the current live role-based admin flow. Live authentication settings are unchanged.

## Behaviour

Administrators sign in with their password, then enrol or verify a TOTP authenticator before loading management records. Setup supports a QR image and a selectable manual key for use on the same phone. Setup keys and codes are never written to app storage. Verification replaces the session through encrypted storage and checks the server's authorisation before opening admin controls. A verified admin can add a backup authenticator from Account. Multiple verified authenticators appear in a selector during sign-in. Only unfinished factors can be removed in the app; there is no switch to bypass or disable mandatory admin MFA.

Customer sign-in is unchanged. Password-only admins can read their own profile to complete setup, but cannot use other customers' data or administrative writes after enforcement is applied. The existing RLS policies and privileged RPCs use `public.is_admin()`. The staged migration changes that function to require the protected admin role, the server-validated `aal2` claim, and a verified TOTP factor. The status RPC returns only booleans for the current account.

## Activation sequence

1. Finish or pause live testing and arrange for every administrator to update to v0.6.10 or later. Each person should use a separate admin account. Enrolling MFA may revoke other sessions on the same account.
2. Keep an independently verified owner login to the Supabase dashboard, with its own recovery/backup factor. Dashboard MFA and Clean Things app MFA are separate.
3. Back up the live database and capture the existing `public.is_admin()` function definition. Inspect current policies and privileged RPCs for custom admin checks that do not call this function. Verify `auth.mfa_factors` and `auth.jwt()` are available, TOTP enrolment/verification is enabled, and the live auth verification rate limits are suitable. Do not print any factor secrets or tokens.
4. First apply [the migration](../supabase/migrations/202609290002_admin_mfa.sql) to a staging project using staging configuration and two disposable accounts. Run the acceptance checks below. The migration is independent of the broader release-repair migration; it changes no booking rows, account roles or authenticator factors.
5. With owner approval and updated admin devices ready, apply the same transaction to production. This immediately restricts old password-only admin sessions. The new app can still access its own profile, enrol an authenticator and verify the code. The user must enter the real setup key and codes in their own authenticator/app; do not send them to chat or put them in screenshots.
6. Each administrator verifies a first authenticator, then adds a backup from Account. Confirm a fresh sign-in with the backup before considering rollout complete. Record the acceptance results and the deployed migration version.

Before activation, v0.6.10 recognises only the exact missing status-RPC response (HTTP 404/PGRST202), preserves existing server-authorised admin access and hides authenticator setup. Earlier v0.6.4–v0.6.8 builds instead blocked admins pending activation. Generic errors and malformed responses still block entry. After server activation, v0.6.10 requires verification before privileged reads. This compatibility behaviour does not implement or advertise frontend-only MFA.

## Acceptance checks

- A customer can sign in and book without being asked for admin MFA; cannot gain admin access even with an `aal2` session.
- A password-only administrator cannot read other customers or edit services/bookings through either the app or direct API calls.
- A new administrator can display the QR/manual key, cancel an unfinished setup, restart it and confirm a valid current code. Invalid and expired codes fail without revealing admin records.
- A returning administrator selects a primary or backup authenticator and verifies. Repeat after force-stop, sign-out, token refresh and a dropped connection.
- Verification HTTP 429 is honoured with a retry wait. Never disable provider rate limits to test this.
- Signing out while a challenge/verification is pending cannot restore the prior account. No codes or setup secrets appear in localStorage, session files, logs or persisted UI state.
- Verify every deployed administrative RPC and Storage policy rejects a password-only admin. The local tests cover repository-defined paths, not unknown production customisations.

## Lost authenticator

Use another verified authenticator from the sign-in selector. If none is available, the project owner must verify the person's identity through an established independent channel, review the exact app user, and use the provider's privileged factor-management controls to remove that user's lost factors. Revoke their sessions and have them enrol afresh through the app. Remove only the confirmed user's factors; do not demote accounts, delete users, expose service credentials, or weaken the global policy as a normal recovery path. Password recovery alone must not grant administrator access. No recovery codes are manufactured by this app.

An emergency rollout rollback requires explicit owner approval: restore the captured previous `public.is_admin()` definition and reload the API schema cache. This reduces protection to its previous level and must be time-limited and recorded. A rollback is not ordinary account recovery. Never delete booking or customer data to recover access.

## Evidence and limits

The backend adapter follows Supabase's [TOTP flow](https://supabase.com/docs/guides/auth/auth-mfa/totp) and the provider's Auth client REST implementation. See [MFA methods](https://supabase.com/docs/reference/javascript/auth-mfa) for backup-factor support. Local PostgreSQL fixtures exercise actual staged SQL and existing RLS/RPC checks. JavaScript tests exercise API payloads, session races, rate limits, cancellation and UI gates. Browser screenshots use fictional QR data, not working credentials. No real factor was enrolled, account changed, code verified or migration applied to the live service during development. Device and hosted-provider acceptance remain outstanding.
