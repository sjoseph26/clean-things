# Test plan and evidence index - v0.6.0

Run from the repository root with generated demo configuration and `npm ci`. All automated test data is fictional. Exact command, result and source hashes are recorded in [the evidence summary](evidence/README.md). A passing local result does not imply a deployed result.

## Executable references

| Test reference | Actual file / invocation | Scope |
| --- | --- | --- |
| CORE | [core.test.js](../tests/core.test.js), included in `npm test` | Validation, totals, modal action behaviour and helper contracts |
| BE / F12 | [backend.test.js](../tests/backend.test.js), included in `npm test` | Auth response formats, ownership API, raw proof upload, type/size validation, stalled-fetch abort |
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

## Required staging and device cases - not yet executed

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
