# Security and disclosure

Report account-access or data-exposure findings privately to the repository owners. Include reproducible steps with fictional data. Do not put passwords, tokens, payment images or customer details in public issues.

The client contains only a public Supabase key. Authorization is enforced by PostgreSQL row-level policies and RPC ownership checks. Administrator access comes from the protected profile role, not UI flags or sign-up metadata. Payment images are private, tied to the owner's booking and accessed with short-lived signed URLs. The native WebView grants geolocation only to its bundled HTTPS origin and disables file access and mixed content.

Local demo access uses explicit customer and administrator role buttons, without passwords or a connection to a backend. Do not treat demo mode as secure multi-user storage. Connected-mode UI records are memory-only; session tokens persist locally for sign-in, so an XSS or a compromised device remains a material risk. CSP and output escaping reduce this risk. Logout removes local tokens even if remote revocation fails; a copied token can remain valid until expiry.

On 29 September 2026 the live token endpoint limit was reduced from 150 to 60 requests per five minutes per IP. This shared bucket covers password grants and session refreshes; it is not a five-attempt account lockout. Other endpoint limits were retained. A bounded direct-API test observed HTTP 429. Monitor shared-network users and adjust if legitimate refresh traffic is affected. Revert the token limit to 150 in Authentication > Rate Limits if this change causes operational problems.

The app honours Retry-After when supplied and uses a 60-second local backoff otherwise. Recovery resends have a separate 60-second local wait. Countdown deadlines are stored in tab session storage without account identifiers or credentials. These controls improve usability only; clearing app data does not remove Supabase's server enforcement. Password errors and recovery-success messages avoid exposing account existence; provider-internal server diagnostics are not displayed during authentication.

Custom SMTP and the recovery landing page were inspected, and one recovery-email request for the authorised owner was accepted. Inbox delivery, actual password replacement, expired/used-token rejection and subsequent sign-in still require an end-to-end test with the account owner. No password was changed during this work. See [security verification](docs/evidence/security-20260929/README.md).

The automated checks are a regression suite, not a penetration-test certification. Physical-device verification, real Storage API tests, production recovery and a live race test remain release gates. See [test scope](docs/TEST-PLAN.md).
