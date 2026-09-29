# Release status - v0.6.9 - 29 September 2026

## v0.6.9 tester update

This build addresses Randy's payment-image setup error, weekday/weekend evening hours, newest-first admin bookings and the Customer/Admin view switch. It is based on the v0.6.2 tester baseline; biometric login and staged MFA remain on their separate feature branch. The targeted database repair is prepared and locally tested, but awaits owner confirmation before live application. See [Randy feedback and acceptance](RANDY-FEEDBACK-v0.6.9.md).


**Candidate for controlled testing. Not a production-readiness sign-off.** The current source repairs the reproduced v0.5.5 defects and includes a compiled native build path. See [recorded evidence](evidence/README.md) for executed results and boundaries.

## Pull-to-refresh update

The large refresh button has been removed. Live browsing screens now support a deliberate downward swipe from the top, with a compact loading indicator. Short, horizontal and cancelled gestures do not refresh. Forms, modal dialogs, nested scroll areas and overlapping requests are protected. A keyboard/screen-reader action remains available.

Android version code is 14. Real-phone gesture and upgrade checks remain outstanding. Earlier evidence under `docs/evidence` records previous builds; see the new pull-to-refresh tests for this change.

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
| Authentication hardening | Live IP throttling configured and HTTP 429 observed; retry/recovery regression tests added | Owner completes password reset, expired/used-link and subsequent sign-in tests; MFA and secure token storage remain future work |
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
