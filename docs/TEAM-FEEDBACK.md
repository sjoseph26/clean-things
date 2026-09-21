# Feedback and iteration log - v0.6.0

The lecturer's feedback supplied on 21 September 2026 is the source for L01-L07. F01-F14 and C01/C02 come from the earlier v0.5.5 technical audit. These are technical findings, not invented independent heuristic worksheets. Current test references are in the [test index](TEST-PLAN.md).

| Finding | Problem / requirement | Implemented response | Evidence and status |
| --- | --- | --- | --- |
| L01 | Incorrect test references; NFR-08 | Replaced stale filenames and distinguished static, DOM, SQL, browser and manual cases | TEST-PLAN and TRACEABILITY; report-internal links await submitted report |
| L02 | Independent heuristic worksheets absent; NFR-01/02 | Separate E1/E2/E3 templates and independent-first protocol | Templates ready; actual independent evaluation remains outstanding |
| L03 | Individual work unclear; NFR-08 | Named contribution matrix with task, commit, validation and acknowledgement fields | Members must supply genuine records; no invented history |
| L04 / F13 | Availability differs between accounts; FR-04/12 | Server occupancy RPC, initial/date refresh, explicit Refresh, final conflict check | AVL-01..03 and F13 pass locally; live A/B race remains pending |
| L05 / F06 | Payment proof not stored; FR-09/16 | Upload bytes to private bucket; link validated owner/booking object path; signed admin viewing | PAY-01..05, adapter and browser pass; real Storage API pending |
| L06 | Security/performance/recovery claims insufficient; NFR-03/04/10 | SQL isolation and snapshot restore; scoped browser timings; explicit live acceptance gates | SEC/REC/local timing evidence supplied; no production certification |
| L07 | Documentation does not match submitted build | Current docs aligned to v0.6.0 candidate and old claims labelled historical | PACKAGE check; actual submitted report still needed |
| F01 | Backend bootstrap not invoked | Invoke startup loading and session restoration | F01 |
| F02 | Map save loses typed fields | Capture draft before opening picker | F02 |
| F03 | Invalid coordinate silently saves default | Validate inputs before saving; keep modal open on error | F03 |
| F04 | Zoom control moves selected pin | Exclude map controls from pointer-drag handlers | F04 |
| F05 | Failed administrator write appears saved | Clone edited data; commit after success | F05, STATE-01/02 |
| F07 | Service text can be interpreted as HTML | Escape catalog/detail/admin fields and restrict script sources | F07, native/CSP review |
| F08 | Punctuation-only telephone accepted | Validate characters and actual digit count in UI/RPC | F08, VAL-01 |
| F09 | Customer email edit claims change that Auth never made | Read-only login email; database rejects direct profile email changes | F09, SEC-04 |
| F10 | Add-on IDs regenerate after editing | Preserve IDs by unchanged name during reorder/reprice | F10; renaming creates a new identifier |
| F11 | Failed logout leaves signed-in UI | Clear local identity/tokens immediately | F11; remote revocation still depends on connectivity |
| F12 | Network calls can hang indefinitely | Abort fetches after configured timeout with actionable error | BE/F12 |
| F14 | Repeated booking submit duplicates work | Disable/guard submit and retain request UUID; server deduplication | F14, DATA-01 |
| C01 | Selected slot text contrast 2.99:1 | Darker selected background | CSS-derived 5.513:1 |
| C02 | Dark success mark contrast 1.50:1 | Dark foreground on success green | CSS-derived 11.806:1 |
| C03 | Light warning badges 4.44:1; admin slot labels 4.39:1 | Darker warning/muted foregrounds | Final browser selected-rule checks |
| LOC-01 | Current-location permission and fallback unreliable | HTTPS bundled origin, real native compile, trusted-origin runtime bridge; preserve manual fallback | Simulated GPS success/denial and native compilation; physical phone pending |
| DEP-01 | Playwright test dependency audit advisory | Upgrade pinned test tool to 1.55.1 | Dependency audit evidence; not part of APK runtime |

For a new observation append its stable ID, actual evidence, decision, implementation file/commit and retest. Preserve original independent sheets and link them here only after evaluators complete them. Do not turn a technical test into a claim about user task success.
