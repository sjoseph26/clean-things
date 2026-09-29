# Test plan and evidence index - v0.6.5

Run from the repository root with generated demo configuration and `npm ci`. All automated test data is fictional. Exact command, result and source hashes are recorded in [the evidence summary](evidence/README.md). A passing local result does not imply a deployed result.

## Executable references

| Test reference | Actual file / invocation | Scope |
| --- | --- | --- |
| CORE | [core.test.js](../tests/core.test.js), included in `npm test` | Validation, totals, modal action behaviour and helper contracts |
| BE / F12 | [backend.test.js](../tests/backend.test.js), included in `npm test` | Auth response formats, ownership API, raw proof upload, type/size validation, stalled-fetch abort |
| AUTH-02..04, REC-02..04 | [auth-security.test.cjs](../tests/auth-security.test.cjs), included in `npm test` | 429/date-based backoff, reload persistence, expiry, generic credential errors, recovery resend limits and configuration failures |
| AUTH-05, REC-05 | [regression.test.cjs](../tests/regression.test.cjs), included in `npm test` | UI countdown persistence, independent login/reset controls and generic recovery confirmation |
| F01-F11, F13-F14, LOC-01, AUTH-01, STATE-01/02 | [regression.test.cjs](../tests/regression.test.cjs), included in `npm test` | Executed DOM workflows and injected failure cases |
| SEC-01..06, DATA-01, AVL-01..03, VAL-01, PAY-01..05, REC-01 | [database.test.cjs](../tests/database.test.cjs), included in `npm test` | Real application SQL/RLS in embedded PostgreSQL with fixture service schemas |
| C01/C02 and theme pairs | [theme-contrast.test.js](../tests/theme-contrast.test.js), included in `npm test` | Contrast computed from shipped CSS, not duplicate colour constants |
| STATIC-LOCATION | [location.test.js](../tests/location.test.js), included in `npm test` | Static manifest/native/build contract checks; no Android runtime execution |
| STATIC-WORKFLOW | [workflow.test.js](../tests/workflow.test.js), included in `npm test` | Static auth/form/RPC checks; complements behavioural tests |
| BROWSER | [browser.test.cjs](../tests/browser.test.cjs), `npm run test:browser` | 15 UI states plus timing per width/theme; 360/393/412px, light and dark |
| PACKAGE | [check_source_package.py](../scripts/check_source_package.py), `npm run check` | Required files, links, version and package-secret exclusions |
| NATIVE-BUILD | [build-apk.sh](../build-apk.sh) | AAPT2, javac, D8, alignment and actual APK signature verification |

Use these filenames and case IDs in the report. F12 belongs to the backend adapter test, not the DOM test. Historical script `visual-smoke.js` has been replaced by `browser.test.cjs`; old asset-only repacking is no longer a release path.

The browser flow signs in, chooses a service and mobile slot, uses simulated GPS, preserves details, submits a booking, uploads an image body and opens admin screens. Accessibility checks cover contrast, field labels, button/link names and ARIA attribute validity. They do not certify all WCAG criteria. Blank map tiles in screenshots are intentional network fixtures. Performance timings are local mocked measurements, not evidence of normal mobile-network acceptance.

The database suite uses PGlite with Auth/Storage service-table fixtures, a non-sending `net.http_post` fixture and no real Vault secrets. Only unavailable extension-install statements are skipped. App migrations, security-definer RPCs, row policies, triggers and restore logic execute. Storage API behaviour, actual email/Meta services and concurrent independent backend connections are separate tests.

## Required staging and device cases - not yet completed

Partial LIVE-01 evidence from 29 September is recorded in [security verification](evidence/security-20260929/README.md). The full recovery/password-change and real-device cases remain open.

Record tester, date, app/source version, device/OS/WebView, accounts, network, steps, expected/actual results and a redacted evidence path for each case.

| ID | Procedure and pass criterion |
| --- | --- |
| LIVE-01 | Fresh A/B signup, confirmation, sign-in, wrong password, duplicate attempt and recovery; valid accounts work and errors accurately explain failures |
| LIVE-02 | A books a slot; B refreshes and sees it unavailable without customer details. Submit a simultaneous A/B conflict with distinct sessions: exactly one booking succeeds |
| LIVE-03 | Admin changes a service/price/availability; both customers refresh and receive identical current values; existing booking snapshots stay intact |
| LIVE-04 | A uploads real PNG/JPEG/WebP proof. Download and compare bytes as A and admin. B/guest cannot view/link/change it. Expired signed URL fails. Oversized/invalid type fails |
| LIVE-05 | Disconnect during create/update/proof upload, reconnect and retry; one booking per request UUID and no false success/partial status |
| DEVICE-01 | Install fresh QA and update an existing live prototype with the same certificate; launch, restart, back, file picker and session behaviour work |
| DEVICE-02 | GPS precise/approximate/denied/device-location-off/timeout; pin follows allowed fix, manual fallback works, typed details stay intact |
| PERF-01 | On representative normal mobile connectivity, record at least 10 cold main-screen loads and 10 submissions per device; compare each observation with <=3s and <=5s, also report median and p95 |
| REC-LIVE-01 | Restore database plus proof-image bytes into isolated staging; reconcile record links, object hashes and counts, record recovery time/lost writes, then rerun isolation and core task |
| UX-01 | At least 3 representative users; measure unaided booking completion. Acceptance is >=80% (with 3 users all 3 must succeed) |
| HEUR-01 | 3-5 evaluators inspect independently, save their own worksheets, then aggregate findings and map them to changes |
| INT-01 | With authorised recipients, verify recovery/confirmation email and actual WhatsApp provider response; do not equate queued with delivered |

Do not mark these rows Passed until executed. No test can establish that an application has no bugs; new reproducible findings should become issues with regression evidence.

## v0.6.1 pull-to-refresh checks

`tests/pull-refresh.test.cjs` covers trigger threshold, cancellation, horizontal/multi-touch gestures, top-of-page detection, nested scrolling, form controls, concurrent requests, failure recovery and accessible invocation. `PTR-07` in `tests/regression.test.cjs` checks protected application screens. The browser suite checks the indicator in both themes and verifies that releasing a pull refreshes the catalogue exactly once.

On Android, verify a pull at the top of Home, Services and My bookings; scroll normally partway down; cancel a short pull; retry with connectivity lost/restored; and confirm unfinished booking/payment/settings forms remain unchanged. These physical-device checks have not yet been performed.

## v0.6.2 admin and navigation checks

Automated coverage: `ADMIN-01..04`, `BACK-01`, `SESSION-01..06` and `NATIVE-01` verify admin identity, structured add-ons, combined month filters, popup dismissal, token refresh races/revocation and Android asset loading. The browser suite additionally creates/edits/deletes a mocked booking, tests browser Back, and inspects the new add-on and filter layouts in both themes at three mobile widths.

Phone acceptance: install v0.6.2 over the existing app; sign in as admin, background/resume and revisit management; create an add-on with distinct name/description/price, then reopen it; filter bookings by month, status and search; press/gesture Back on a booking or service dialog and confirm only the dialog closes. After the separately applied availability hotfix, use an agreed test booking to verify date selection, creation, adjustment and deletion against the live backend. Do not delete genuine customer records as test data.

## v0.6.3 encrypted-storage checks

`STORE-01..09`: migration ordering, encrypted-session precedence, failed migration, missing bridge/corrupt storage, failed write, logout failures, browser memory-only sessions, malformed legacy data and backend sign-in/refresh/sign-out integration. `STORE-10` compiles and executes the actual Java AES-GCM envelope code with the JVM provider: repeated round trips, unique IVs, tampered header/IV/ciphertext, truncation and wrong-key rejection. `STORE-11` checks native document/frame/no-backup restrictions; `NATIVE-01` verifies packaged HTML dependencies are allowed. These are not Android Keystore instrumentation tests.

On a test phone, upgrade an existing signed-in v0.6.2 installation to v0.6.3, check the account remains usable, force-stop/reopen and verify restoration. Sign out, force-stop/reopen and confirm the account does not restore; sign in again and confirm encrypted persistence resumes. Repeat after access-token renewal and exercise normal bookings/GPS/file selection. Use a disposable test device/account for storage corruption or key-loss checks. Current runtime has no connected Android device or emulator, so those results must be recorded separately.

## v0.6.4 MFA verification

`MFA-API-01..10` cover challenge/verify payloads and token persistence, malformed input, wrong codes, verification throttling, logout/account-switch races, concurrent requests, enrolment gates, transient secrets, guarded cancellation and absent enforcement. `MFA-UI-01..05` cover protected-data gating, blocked rollout state, setup/no-secret-persistence, duplicate submission, wrong codes, logout and required post-verification server authorization. `MFA-DB` runs the staged SQL twice against an older-schema fixture and verifies direct RLS/RPC denials for password-only admins, customers and stale factorless AAL2 sessions. The full database suite also runs the migration with its other real policies.

The browser suite exercises new-admin enrolment and returning-admin challenge, wrong then correct codes, a backup authenticator and the existing booking flows in both themes at three phone widths. Test codes and QR images are fixtures. Run [hosted and phone acceptance](ADMIN-MFA-ROLLOUT.md) before deployment.

## Biometric verification (v0.6.5)

`BIO-01..06` exercise the JS/native contract: locked plaintext migration denial, callback correlation, forged-success denial, cancellation/retry, password fallback, duplicate requests, enable/refresh/lock/disable. `BIO-07` executes the actual Java envelope with a JVM AES provider and checks modified headers/payloads, wrong keys, truncation and token rotation. `BIO-08` is a static Android boundary contract, not proof of runtime hardware behaviour. `BIO-09..10` cover backend logout and serialization with refresh/requests. `BIO-UI-01..06` exercise bootstrap/back navigation gating, cancellation/duplicates, mandatory server MFA after unlock, fallback races, network-failure retry and the successful customer account route.

Browser tests simulate the native adapter in six viewport/theme combinations and inspect locked, cancelled, enabled and disabled screens, plus enable/lock/password actions. Hardware recognition, key invalidation and real lifecycle tests remain in [BIOMETRIC-UNLOCK.md](BIOMETRIC-UNLOCK.md).
