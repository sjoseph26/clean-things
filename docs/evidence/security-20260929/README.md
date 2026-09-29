# Authentication verification - 29 September 2026

Scope: login throttling, recovery-request handling and inspection of the existing live recovery configuration. This is a partial security check, not production approval or an OWASP certification.

## Live configuration and observations

- Supabase Free project: token-endpoint refill limit reduced from 150 to 60 requests per five minutes per IP. The dashboard labels this "Rate limit for token refreshes"; Supabase documents that it also covers password grants. Signup/recovery and verification limits remain 30 per five minutes. IP forwarding remains disabled.
- The token bucket allows bursts and refills continuously. It does not implement a fixed account lockout after five failures. Shared-IP users share the bucket.
- Dashboard configuration was visually verified. The private dashboard screenshot is excluded from this repository.
- [Initial spaced test](live-rate-limit.json): 32 invalid attempts over 56.71 seconds, no 429 observed. This result alone does not demonstrate enforcement.
- [Bounded burst test](live-rate-limit-burst.json): 30 requests over 23.26 seconds, including HTTP 429 with `over_request_rate_limit`. Requests used an unregistered, random `example.invalid` address; no existing user password was guessed. Tests stopped after the batch that contained a 429. No Retry-After header was supplied.
- The recovery landing page loaded in the browser. Its URL matches the configured Site URL. No additional redirect allowlist entries were present.
- Custom SMTP was enabled through Brevo, with a 60-second minimum interval per user. Credentials were not read or changed.
- One recovery request for the authorised administrator was accepted by the recovery page and displayed a generic success message. This does not prove inbox delivery or password replacement.

## Source verification

Eight new cases cover server 429 handling, numeric/date/missing Retry-After values, reload persistence, retry expiry, generic errors, configuration failure, recovery request spacing and independent UI controls. All 48 automated tests pass; see [test output](unit-tests.txt). Historical evidence outside this folder refers to earlier source.

Client countdowns are convenience controls, not a security boundary. The backend remains responsible for rate enforcement. No passwords, tokens, email addresses or authentication headers are stored in the test evidence or countdown state.

## Remaining checks

The account owner must confirm email delivery, privately enter a new password, and verify sign-in with it. A real used-link replay and expired-link rejection test remain open. No password reset was completed or existing account/session intentionally revoked. Administrator MFA, encrypted native token storage and full live cross-customer testing remain separate work.

Existing installed APKs are not automatically updated by a source commit. GitHub CI builds a demo-configured QA APK; these app changes need a separately configured connected build before testing on the live Android app.

Reference: [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits), [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
