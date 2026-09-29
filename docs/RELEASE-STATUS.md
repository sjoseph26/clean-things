# Release status - v0.6.7 - 29 September 2026

**Candidate for controlled testing. Not a production-readiness sign-off.** The current source repairs the reproduced v0.5.5 defects and includes a compiled native build path. See [recorded evidence](evidence/README.md) for executed results and boundaries.

## Pull-to-refresh update

The large refresh button has been removed. Live browsing screens now support a deliberate downward swipe from the top, with a compact loading indicator. Short, horizontal and cancelled gestures do not refresh. Forms, modal dialogs, nested scroll areas and overlapping requests are protected. A keyboard/screen-reader action remains available.

Android version code is 19. Real-phone gesture and upgrade checks remain outstanding. Earlier evidence under `docs/evidence` records previous builds; see the new pull-to-refresh tests for this change.

## Completed in this repair

- Current-location pin, manual fallback, form preservation and coordinate/zoom repairs.
- Corrected light/dark contrast and tested representative mobile screen sizes.
- Startup/session, timeout, failed-write consistency and duplicate-submit repairs.
- Cross-customer availability RPC, transaction rules and idempotent booking creation.
- Actual private payment-image upload and ownership/path validation.
- Local SQL account isolation, receipt linkage and snapshot-restore checks.
- Source package sanitisation, documentation index, test references, traceability and GitHub CI preparation.
- True Java/D8 native compilation and signature verification. The recovered original certificate matches v0.5.5; signing material is excluded from the source.

## Gates still open

| Gate | Current evidence | Required next action |
| --- | --- | --- |
| GitHub | Private sjoseph26/clean-things published; verification and QA build passed on 29 September | Require passing CI for subsequent changes |
| Authentication hardening | Live IP throttling configured and HTTP 429 observed; retry/recovery regression tests added | Owner completes password reset, expired/used-link and subsequent sign-in tests; v0.6.4 MFA awaits coordinated server rollout; encrypted token storage awaits phone verification |
| Database rollout | Migration tested locally | Back up, apply to staging, run LIVE-01..05 before production |
| Payment storage | Raw-body browser/adapter and SQL-policy tests | Actual Supabase upload/download/expiry/file-byte restore |
| Native operation | Compiled and signed APK | Real-phone GPS, chooser and upgrade tests |
| Performance | Local mocked timings | Normal-connectivity device measurements against 3s/5s |
| Recovery | Embedded PostgreSQL snapshot restored | Hosted DB and image-byte restore drill |
| Usability / heuristic evaluation | Protocol and independent blank forms prepared | Team collects authentic observations and evaluator worksheets |
| Contributions | Named member record prepared | Members add their actual work and commit/evidence links |
| Submitted report | Lecturer feedback and assignment brief available | Supply actual submitted report to correct its internal references |

Do not describe missing evaluation sheets as completed independent evaluations. Do not substitute automated browser screenshots for human usability observations. Do not submit this version as deployed without the remaining gates and actual evidence.

## Live availability incident — 29 September 2026

A phone reported that `appointment_availability(requested_date)` was missing from the API schema cache. Read-only inspection confirmed the live database lacks that function and the `client_request_id` / `payment_proof_path` columns from the full repair migration.

A targeted, transactional [availability hotfix](../supabase/migrations/202609290001_availability_hotfix.sql) has been tested against an older-schema fixture. It returns only slot times and status to authenticated users, denies anonymous execution and requests an API schema reload. It does not change booking rows, profile rows or payment data. Applied to Clean Things Live after explicit owner approval on 29 September 2026. Supabase reported success. A read-only transaction under the authenticated database role with a synthetic user claim returned all six slots for 30 October 2026; the transaction was rolled back. Permission inspection showed anonymous execution denied and authenticated execution allowed. An anonymous REST request returned HTTP 401 / PostgreSQL 42501 (permission denied for the function), confirming the API schema cache now recognises the RPC. No actual account sign-in or phone test was performed in this verification. The broader repair migration remains a separate staging/rollout task. Existing v0.6.1 APKs can use this backend fix without reinstalling.

## v0.6.2 tester feedback repair

- Keep the authenticated admin profile when the customer directory is empty or temporarily unavailable; customer refresh cannot replace that identity.
- Share token refresh between simultaneous requests; retry an HTTP 401 once after renewal. Transient failures preserve login; confirmed revoked/expired refresh sessions still require sign-in. Late responses from a previous account cannot renew or clear a newer login. Normal sign-out affects the current device's session.
- Replace pipe-delimited add-on entry with separate name, description and numeric GYD price fields. Preserve existing add-on IDs when renaming/repricing; validate incomplete entries and retain failed-save drafts.
- Filter admin bookings by month alongside search and status. Scheduled bookings use appointment dates; walk-ins use their recorded date in Guyana time. All months clears the month restriction.
- Native Back dismisses the open dialog before navigating. Browser Back also preserves the underlying form when dismissing a dialog.
- Allow the bundled pull-refresh script through the Android asset security boundary. The v0.6.1 allowlist omitted this script; a new native asset test covers every HTML dependency.

Executed on 29 September 2026: 68 automated tests passed; 104 Chromium state/timing results across 360/393/412-pixel viewports and light/dark themes, with zero selected-rule accessibility violations or runtime errors. Browser booking creation, admin editing and deletion used mocked API responses, not production records. Native Java/D8 compilation and APK v2/v3 signature verification passed. Packaged web assets match the tested source. No new live database mutation was made in this update.

Artifact: `CleanThings-Live-v0.6.2.apk`; Android package `gy.cleanthings.app`, version code 14. APK SHA-256: `43ea37c1de83a22914bbb0913bc2acca756e4b508e90f70fbfa49651513aa3d1`. Signing certificate SHA-256 matches the original installed prototype: `0eafb82e869cde71405fbec324429da0d043fd529189cb6cb14758bfbda28375`.

Phone upgrade, device Back gesture, sustained admin session and real-account booking acceptance remain user checks. The precise cause of Randy's intermittent admin switch has not been observed on his device; the reproduced client failure paths above are repaired. The broader database migration remains outside this update.

## v0.6.3 encrypted-storage feature candidate

Implemented on `feature/secure-session-storage` while the v0.6.2 tester baseline remains on main. Android sessions now use an AES-256-GCM ciphertext file, a non-exportable Android Keystore key and the no-backup directory. Upgrade migration waits for successful encrypted persistence before erasing the legacy localStorage entry. Failed migration does not authenticate from the unsecured copy and displays a warning. Sign-out clears local storage/key and attempts server revocation even if local clearing fails. Browser previews retain sessions only in memory. Account screens explain sign-in storage protection.

The native bridge exposes only read/write/clear and is restricted to the trusted bundled main document. Main-document navigation and asset allowlists are enforced; CSP excludes child frames and workers. Runtime JavaScript still needs the access token, so encryption at rest does not eliminate XSS or compromised-device risks. Administrator MFA and biometrics are not implemented in this candidate.

Verification on 29 September 2026: 79 automated tests passed, including actual Java AES-GCM envelope round-trip/tamper/wrong-key tests and native-adapter migration/failure/refresh/logout tests. The JVM provider was used for cryptographic tests, not Android Keystore. All 110 Chromium state/timing results passed with zero selected-rule accessibility violations or runtime errors. Native Java/D8 compilation passed. APK v2/v3 signatures verified against the original certificate, and bundled web assets match the tested source.

Artifact: `CleanThings-Live-v0.6.3.apk`; package `gy.cleanthings.app`, version code 15. SHA-256: `0a5c07d9d5550a9347f8d316ade5c82da39e361b5888ab26b8b1652cdf11d311`. No live database, account or authentication-provider settings were changed. Device upgrade/migration, force-stop restoration, sign-out persistence, key-loss behaviour and hardware backing remain unverified because no Android device/emulator is attached. This build is for feature testing, pending those device checks.

## v0.6.4 administrator MFA feature candidate

Implemented on `feature/admin-mfa`, based on the encrypted-storage branch. Includes authenticator enrolment via QR/manual key, six-digit code verification, backup authenticator selection/enrolment, cancellation of unfinished factors, retry throttling, generation-bound session updates and an independent server authorisation recheck. Setup secrets and codes remain transient. Privileged records are not loaded until verification succeeds. Missing server enforcement is visibly blocked. Existing customer sign-in and ownership rules remain in place.

The staged `202609290002_admin_mfa.sql` transaction requires the protected admin role, a server-validated AAL2 claim and an existing verified TOTP factor in `public.is_admin()`. It adds an authenticated current-account status RPC and reloads the API schema cache. It is independent of the broader repair migration. **It has not been applied to the live database.** No real authenticator was enrolled, verification code used, account changed or live auth setting modified. Main and Randy's v0.6.2 baseline remain unchanged.

Verification: 95 automated tests passed, including direct RLS/RPC enforcement on older-schema and full-migration fixtures, malformed/wrong codes, rate limits, token renewal serialization, logout/account-switch races and UI gates. All 117 Chromium state/timing results passed across three phone widths and both themes, with zero selected-rule accessibility violations or runtime errors. Provider responses and QR data were mocked. Java/D8 native compilation and APK v2/v3 verification passed; packaged assets match source. The original signing certificate is retained.

Artifact: `CleanThings-Live-v0.6.4.apk`; package `gy.cleanthings.app`, Android version code 16. APK SHA-256: `4311bb88d8828b8afd893e952679838a043a02e6f0b765dd3b745264e12778bb`. This is a feature-test candidate, not an activated live MFA release. Staging/provider/phone acceptance and coordinated admin upgrades must precede owner-approved live enforcement. The new app keeps admin management locked until server activation. See [activation and recovery instructions](ADMIN-MFA-ROLLOUT.md).

## v0.6.5 biometric unlock feature candidate

Implemented on `feature/biometric-unlock`, based on the staged administrator MFA feature. Adds optional Android 11+ strong fingerprint/supported-face unlock, an auth-per-operation Keystore-wrapped session key, opt-in and verified opt-out, manual lock, password fallback, and a fresh locked Activity after a 60-second background gap. Screenshots/recent-app previews are suppressed while enabled. Session refresh is serialized with verification; late/cancelled callbacks cannot restore an erased account. Native unlock still passes through server session, role and MFA checks.

Verification: 111 automated tests passed. These execute the real Java AES envelope and simulated JS/native/provider flows, plus static Android boundary contracts. Java/D8 compilation and final APK v2/v3 signature verification passed. Packaged assets match tested source, and the original signing certificate is retained. Real device recognition, Keystore invalidation, background behaviour and upgrade/file-picker flows remain unverified; see [device acceptance](BIOMETRIC-UNLOCK.md). All 141 Chromium state/timing results passed across three phone widths and both themes, with zero selected-rule accessibility violations or runtime errors. Biometric prompts and remote responses were simulated.

Artifact: `CleanThings-Live-v0.6.5.apk`; package `gy.cleanthings.app`, Android code 17. SHA-256: `82a3e3b3b164adcb5342f4222aaeaa26e252e4fd4c09c12b550ed72a66e6d3fa`. This is a feature-test build. No live database/auth configuration changes were made. Because it includes staged MFA, administrator access still awaits coordinated server activation; Randy should keep the existing tester build.

## v0.6.6 biometric setup hotfix

The reporting phone showed a generic storage error when enabling biometrics in v0.6.5. A source defect submitted AAD to an auth-per-use Keystore operation before biometric authentication. The hotfix defers this operation until authentication succeeds, retaining the same encryption/authentication strength and envelope layout. Fixed BIO-* stage codes provide safe troubleshooting if the phone still fails. A host auth-gated CipherSpi reproduces the old sequence's cached failure and validates the corrected sequence. The precise phone exception was unavailable, so actual resolution remains pending a device retry.

112 automated tests passed; Java/D8 compilation and final APK v2/v3 signing passed. Packaged assets match source. The unchanged browser UI retains v0.6.5's 141-result evidence; it was not rerun for this native-only change. No real biometric device, server auth settings or live database was accessed. Staged administrator MFA remains inactive.

Artifact: `CleanThings-Live-v0.6.6.apk`; package `gy.cleanthings.app`, code 18; SHA-256 `24b2c6f25624ac9746b61a63edaf6e09873eaee1f0646080e687d8327dddc39e`. Original signing certificate retained. Install over v0.6.5 for the reporting phone's retry; this supersedes v0.6.5 as the biometric feature candidate. Randy's baseline and main remain unchanged.

## v0.6.7 visible biometric sign-in control

Added a vector fingerprint and labelled biometric sign-in button above the password fields, plus matching fingerprint artwork on the protected-session unlock screen. Unconfigured/unsupported states show an accessible inline explanation; no authentication is attempted before setup. Existing crypto, session cleanup and administrator MFA rules remain unchanged. Includes the v0.6.6 native hotfix.

112 automated tests and 36 affected Chromium screen/state checks passed (three widths, two themes), with zero selected-rule accessibility violations or runtime errors. The unaffected browser workflow was not rerun. Java/D8 compilation, source-asset comparison and APK v2/v3 signature checks passed. Native recognition still needs the reporting phone's retry. No live database or auth settings changed.

Artifact: `CleanThings-Live-v0.6.7.apk`; package `gy.cleanthings.app`, code 19; SHA-256 `10c26b0b48967de19e3369ce80f07ccfeb8950208b6aea6c91a861cd0b620654`. Original signing certificate retained. Update over the existing feature build; administrator MFA activation remains pending.
