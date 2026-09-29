# Deployment and recovery guide - v0.6.2

This guide describes the prepared candidate. No production database change or GitHub publication was performed during this repair.

## 1. Prepare a staging project

Use a separate Supabase project with fictional customer A, customer B and an administrator. Keep email confirmation enabled and configure the project's actual password policy, recovery redirect and SMTP. The application additionally requires eight characters, one letter and one number. Provider limits must be checked in the project; historic email quotas are not release evidence.

For a new database apply every file in `supabase/migrations` in filename order. For an existing v0.5.5 database, first verify the earlier migration history, then apply only [202609210001_release_repairs.sql](../supabase/migrations/202609210001_release_repairs.sql). It runs transactionally. Do not replay the initial migrations against an existing project. The one-off personal-email administrator bootstrap has been removed from the distributable historical grant file; deployed role assignments are not automatically changed.

Grant the intended administrator using [seed-admin.sql](../supabase/seed-admin.sql) only after replacing its placeholder with the verified Auth user UUID. A customer cannot grant their own role. Do not rely on sign-up metadata to grant access.

## 2. Public client configuration

Set `CT_SUPABASE_URL`, `CT_SUPABASE_PUBLISHABLE_KEY` and `CT_PASSWORD_RESET_URL` in your local environment, then run `python3 scripts/configure.py`. The URL must use the project's `https://...supabase.co` address; custom domains need an explicit CSP/config change. Use a public `sb_publishable_` key only. The generated `config.js` is ignored by Git. Never put a service-role key, SMTP key, database password or Meta token in client assets.

The password-reset URL must be an HTTPS page under the project owner's control, included in Supabase's redirect allowlist, with a working recovery handler. Leaving it blank produces an explicit configuration error. Recovery-page hosting is outside this repository. Verify it with a consented test account before rollout.

## 3. Payment proof storage

The migration creates a private `payment-proofs` bucket (JPEG/PNG/WebP, maximum 3 MiB). Paths are `user UUID/booking UUID/random UUID.extension`. The application uploads the file body, then calls the ownership-checked payment RPC. That RPC verifies the Storage object exists for that customer and booking. Admin review uses a five-minute signed URL; signed URLs are not saved as booking data.

A failed upload never marks payment submitted. A failed/uncertain RPC preserves the uploaded path for retry while that form stays open. Unreferenced uploads can remain after abandonment; an operator must reconcile references and apply a documented retention policy before deleting orphan objects. Client overwrite/delete is disallowed for proof images. Existing filename-only rows are not magically converted into stored files: ask the affected customer to resubmit the image or use a valid reference.

Verify actual Storage API upload, owner/admin read, other-customer denial, expiry and file-byte download on staging. The local database test covers metadata policies; it is not a real Storage service test.

## 4. Native builds and rollout

Install JDK 17, Android platform 35 and build-tools 35.0.1. Set `ANDROID_SDK_ROOT`. Run `bash build-apk.sh qa` for a separate QA package. The selected `config.js` controls demo versus connected operation; use staging configuration for connected QA.

For a live update set these variables privately and run `bash build-apk.sh live`:

- `CT_SIGNING_KEYSTORE`: original live signing file path.
- `CT_KEY_ALIAS`: original alias.
- `CT_STORE_PASSWORD` and `CT_KEY_PASSWORD`: original passwords.

The live build refuses to create a replacement signing key. The original key recovered during this repair matches the v0.5.5 certificate, but is excluded from all source packages and Git. The old prototype uses a development certificate; retain it for prototype upgrade continuity and plan a proper production signing strategy before a public release.

The v0.6.2 live package keeps `gy.cleanthings.app` and increments version code to 14. Its APK signature can be verified with Android `apksigner verify --verbose --print-certs`. Install over the old prototype only after the migration and staging gates pass. Do not uninstall first if you intend to keep the existing installation. Moving bundled content from a file origin to HTTPS means users must sign in again; local file-origin preferences/demo state are not migrated. Shared backend records remain authoritative.

Test on an actual Android phone: fresh launch, existing install update, sign-in, GPS allow/deny/approximate, file picker and proof upload, dark mode, back navigation, network loss and restart. Building and examining the APK cannot certify these interactions.

## 5. Recovery and rollback

Before rollout, create a restorable database backup and a separate export of private Storage file bytes plus an object-path manifest. Store these outside Git with controlled access. Record row counts and hashes and restore into an isolated staging project. Database-only backups do not establish that proof-image bytes can be recovered.

Reconcile booking IDs, references, receipt links, amounts, proof paths and object hashes after restore; measure elapsed recovery time and lost writes. Reapply grants/RLS and verify A/B isolation before accepting traffic. The current local REC-01 result restores an embedded PostgreSQL snapshot including Storage metadata, not real Supabase object bytes or a hosted service.

Deploy database-first, then test the candidate against staging, then perform a controlled production rollout. If an additive migration fails, its transaction rolls back. If the app needs rollback after a successful migration, keep the additive schema and issue a properly signed build with a higher version code; Android normally rejects a lower-code APK. Do not drop proof columns/buckets to roll back the UI. Use the verified backup for serious data faults through an explicit recovery operation.

## 6. Integrations

The WhatsApp SQL trigger uses Meta's Cloud API and secrets held in Supabase Vault. This repair did not change provider credentials, send messages or establish delivery. A queued HTTP request is not proof of delivery. The current UI supports user-initiated WhatsApp/email sharing; no Facebook feature is included. Test external delivery separately with authorised recipients.

Reference: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Android local WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).
