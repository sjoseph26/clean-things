# Security and disclosure

Report account-access or data-exposure findings privately to the repository owners. Include reproducible steps with fictional data. Do not put passwords, tokens, payment images or customer details in public issues.

The client contains only a public Supabase key. Authorization is enforced by PostgreSQL row-level policies and RPC ownership checks. Administrator access comes from the protected profile role, not UI flags or sign-up metadata. Payment images are private, tied to the owner's booking and accessed with short-lived signed URLs. The native WebView grants geolocation only to its bundled HTTPS origin and disables file access and mixed content.

Local demo accounts have public fictional passwords and no connection to a backend. Do not treat demo mode as secure multi-user storage. Connected-mode UI records are memory-only; session tokens persist locally for sign-in, so an XSS or a compromised device remains a material risk. CSP and output escaping reduce this risk. Logout removes local tokens even if remote revocation fails; a copied token can remain valid until expiry. Authentication quotas, confirmation, recovery redirects and SMTP require separate verification in the deployed project.

The automated checks are a regression suite, not a penetration-test certification. Physical-device verification, real Storage API tests, production recovery and a live race test remain release gates. See [test scope](docs/TEST-PLAN.md).

