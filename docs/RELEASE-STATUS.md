# Release status - v0.6.0 - 21 September 2026

**Candidate for controlled testing. Not a production-readiness sign-off.** The current source repairs the reproduced v0.5.5 defects and includes a compiled native build path. See [recorded evidence](evidence/README.md) for executed results and boundaries.

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
| GitHub | Importable repository and CI files prepared | Connect/publish private repository; inspect first Actions run |
| Database rollout | Migration tested locally | Back up, apply to staging, run LIVE-01..05 before production |
| Payment storage | Raw-body browser/adapter and SQL-policy tests | Actual Supabase upload/download/expiry/file-byte restore |
| Native operation | Compiled and signed APK | Real-phone GPS, chooser and upgrade tests |
| Performance | Local mocked timings | Normal-connectivity device measurements against 3s/5s |
| Recovery | Embedded PostgreSQL snapshot restored | Hosted DB and image-byte restore drill |
| Usability / heuristic evaluation | Protocol and independent blank forms prepared | Team collects authentic observations and evaluator worksheets |
| Contributions | Named member record prepared | Members add their actual work and commit/evidence links |
| Submitted report | Lecturer feedback and assignment brief available | Supply actual submitted report to correct its internal references |

Do not describe missing evaluation sheets as completed independent evaluations. Do not substitute automated browser screenshots for human usability observations. Do not submit this version as deployed without the remaining gates and actual evidence.
