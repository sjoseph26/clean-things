# Material AI assistance - v0.6.0

Date: 21 September 2026. Tool: OpenAI Codex in ChatGPT Work Mode. This records the current repair session; it does not reconstruct missing historical evidence.

| Prompt/task summary | Output used | Verification performed | Human review still required |
| --- | --- | --- | --- |
| Fix reproduced app bugs; current-location pin and dark-mode contrast | UI/backend/native repairs and regression tests | DOM failure injection, CSS ratios, Chromium workflows/screenshots and native compilation | Actual phones, project-specific business decisions |
| Resolve availability across accounts and payment proof storage | Additive SQL/RLS/RPC and private image path flow | Executed SQL permissions/conflict/idempotency/receipt tests with fictional Auth/Storage fixtures; raw-file browser upload fixture | Staging and real Storage API, migrations and retention policy |
| Demonstrate security, performance and recovery criteria | Test index, acceptance traceability and local restore exercise | Embedded PostgreSQL restore and linked-row comparison, local mocked timings | Production-equivalent recovery and normal-network timing |
| Make the project ready for GitHub and respond to lecturer feedback | README, sanitised source, CI, evaluation/contribution templates | Link/version/package checks and local equivalents of CI commands | Publish repository, CI-hosted run, genuine independent evaluation/contributions |

No live accounts were created/deleted, no messages sent, no production migration applied and no independent usability observations were invented in this repair. The initial import must be identified as an import, not presented as earlier development history. The provided Part II PDF is an assignment brief; the submitted evaluation report was not available for internal-reference edits.

Development dependencies are pinned in package-lock.json: Playwright (Apache-2.0), jsdom (MIT), axe-core (MPL-2.0) and PGlite (Apache-2.0). These are test tools and are not bundled into the Android runtime. See recorded dependency metadata/audit in the evidence folder for the actual check result. The repository does not grant a licence to the team's logo or code; owners should decide publication/licensing. Map attribution remains visible for OpenStreetMap. Downloaded SDK binaries, signing keys and package dependencies are excluded from source delivery.

## Follow-up - 29 September 2026

At the owner's request, Codex added authentication retry handling and eight regression cases, tightened the live Supabase token-request limit, and ran bounded direct-API tests against a fictional unregistered address. A live recovery-email request was made for the authorised owner; no password was read or changed. The account owner's end-to-end reset test remains open. Details and limitations are in `docs/evidence/security-20260929/README.md`. The previous paragraph about no live changes describes the 21 September repair only.
