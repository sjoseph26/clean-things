# Requirements-to-design-to-test traceability - v0.6.0

Baseline: Part I requirements document supplied with the project. Acceptance thresholds below are retained rather than replaced with weaker local criteria. Automated IDs refer to the [test index](TEST-PLAN.md). A partial result is not a release pass.

| Requirement | Current implementation | Evidence / remaining acceptance |
| --- | --- | --- |
| FR-01 service catalogue | Shared active services loaded at startup/Refresh | F01, BROWSER; LIVE-03 pending |
| FR-02 customise services | Stable add-on IDs and calculated total | CORE, F10; live price-refresh check pending |
| FR-03 bay/mobile mode | Conditional booking form and stored service mode | CORE, BROWSER, VAL-01 |
| FR-04 availability | Minimal shared RPC, unique slot and transaction checks | F13, AVL-01..03; live independent-session race pending |
| FR-05 customer/vehicle validation | Required fields and phone digit/character checks | CORE, F08, VAL-01 |
| FR-06 mobile location/water | GPS/manual pin, required location and water confirmation | F02..04, LOC-01, BROWSER; DEVICE-02 pending |
| FR-07 correct total | Server service/add-on pricing; client preview | CORE, DATA-01/PAY-05; owner verifies real catalogue |
| FR-08 approved MMG instructions | Shared public business settings | STATE-01, admin browser view; actual merchant details require owner validation |
| FR-09 reference OR proof | Actual private object upload and ownership RPC | PAY-01..04, BE, BROWSER; LIVE-04 pending |
| FR-10 status visibility | Read shared records and explicit Refresh | BROWSER/F05/F06; LIVE-03 pending |
| FR-11 change requests | Restricted owner RPC for cancel/reschedule requests | BE and SEC-03; full admin follow-through in staging pending |
| FR-12 admin catalogue/availability | Role checks, atomic settings/day operations | AUTH-01, SEC-04, AVL-03, STATE-01/02; cross-device staging pending |
| FR-13 manage booking lifecycle | Admin confirmation/cancel/completion/edit operations | F05, PAY-05; full lifecycle staging pending |
| FR-14 walk-ins | Admin-only direct booking insert, no appointment needed | UI/source present; physical end-to-end acceptance pending |
| FR-15 cash/MMG | Walk-in payment method and customer MMG evidence | PAY-03/05; cash walk-in acceptance pending |
| FR-16 verify/reject MMG | Admin reviews reference/private image and changes status | PAY-04/05, F05; actual file viewing and reject/resubmit staging pending |
| FR-17 linked receipt | Receipt trigger for completed paid booking | PAY-05, SEC-06, REC-01; share/view/device acceptance pending |
| NFR-01 >=80% users unaided | Revised workflows; independent usability protocol | No new human sessions performed. UX-01 open |
| NFR-02 accessible labels/readability/controls | Theme tokens, labels, modal focus/keyboard handling | CSS and six browser combinations, selected axe rules; screen-reader/device/manual audit pending |
| NFR-03 screens <=3s, submissions <=5s under normal connectivity | Bounded fetches and timing capture | Local mocked measurements only. PERF-01 open |
| NFR-04 authentication/validation/secure transport | Protected roles/RLS/RPC, HTTPS/CSP and escaped text | SEC-01..06, AUTH-01, F07/08, native contracts. Live API/device review open |
| NFR-05 data minimisation | Required booking data only; private records not stored in UI cache | F01/F11, SEC-02/06. Retention/cleanup policy still needed |
| NFR-06 no duplication/loss | Request UUID, unique slot, save-after-success and recovery snapshot | DATA-01, F05/06/14, REC-01; live outage/race/drill open |
| NFR-07 >=3 phone sizes | Responsive layout | Chromium 360, 393 and 412px in both themes. Physical device compatibility open |
| NFR-08 version control | Sanitised Git-ready source, versioned docs/lockfile/CI | PACKAGE and evidence hashes. GitHub publication/member history open |
| NFR-09 consistent linked records | Booking-owner-proof path and one linked receipt | PAY-01..05, SEC-06, REC-01; actual file-byte reconciliation open |
| NFR-10 recover after failure | Local DB snapshot exercise and hosted recovery runbook | REC-01 local pass; database-plus-object-bytes live restore still open |

No acceptance threshold was added for recovery time or data-loss tolerance because none was specified in the available baseline. Record measured recovery time and lost writes, and have the owner agree targets before claiming deployment readiness.
