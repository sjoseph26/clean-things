# Clean Things v0.6.9

Android booking and service-management prototype. This is a **repair candidate**, with local automated evidence and a reproducible native build. It is not certified as deployment-ready; the new database migration and live acceptance checks are still required.

This is Randy’s tester update, based on v0.6.2. The database repair needs activation before payment-image and evening-hours acceptance. See [current status](docs/RANDY-FEEDBACK-v0.6.9.md). Biometric sign-in and staged MFA remain separate.

## Run the fictional demo

Requires Node 22.12+ (tested with Node 24), npm and Python 3.

```bash
npm ci
python3 scripts/configure.py --demo
npm run serve
```

Open `http://127.0.0.1:8080` on the same computer. The demo stores fictional records locally and provides separate **customer demo** and **administrator demo** buttons. Demo access uses no password, PIN or remote account and never connects to Supabase. Reset older demo data from About if necessary. Connected mode uses real Supabase authentication and requires the setup below.

## What changed

- Startup restores the authenticated session and loads shared services/settings.
- Availability includes other customers' occupied slots without exposing their bookings; the database arbitrates conflicts and repeat submissions.
- The GPS pin preserves entered details; invalid coordinates cannot save and zoom controls do not move the pin. Manual placement remains available.
- Payment evidence uploads actual image bytes into private storage and links the stored path to the booking. Filename-only evidence is rejected.
- Failed writes leave saved UI records unchanged; requests time out; logout clears local identity and data.
- Service text is escaped, phone numbers are validated, role checks are enforced and profile login email cannot be silently edited.
- Light/dark controls, selected slots, success marks and warning badges have corrected contrast.
- Native Android code is compiled from source with an HTTPS local origin, scoped geolocation permission, restricted asset loading and no mixed content.

The embedded map uses **OpenStreetMap**, not the Google Maps SDK. It offers the requested current-location pin without requiring a Google Maps billing account. Map tiles need internet and GPS still needs device permission.

## Verify and build

```bash
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use mocked remote services and simulated GPS. Database checks execute application migrations/RLS in PGlite with Auth/Storage fixtures. Neither replaces live Supabase or physical-phone testing.

For an Android build, install JDK 17 and Android SDK platform 35/build-tools 35.0.1, set `ANDROID_SDK_ROOT`, then run:

```bash
bash build-apk.sh qa
```

The output is `dist/CleanThings-qa-v0.6.9.apk`, a separate `gy.cleanthings.app.qa` app for fictional testing (Android 7+). The live variant requires the original signing key and connected configuration. See the deployment guide before building/installing it. Native version code: 21.

## Project documentation

| Guide | Purpose |
| --- | --- |
| [GitHub setup](docs/GITHUB.md) | Import, collaborate and run CI |
| [Live setup](docs/LIVE-SETUP.md) | Migrations, public configuration, signing, staged rollout and recovery |
| [Technical design](docs/DEVELOPMENT-NOTE.md) | Components, trust boundaries, data model and limitations |
| [Test plan and index](docs/TEST-PLAN.md) | Exact executable references and manual acceptance cases |
| [Requirements traceability](docs/TRACEABILITY.md) | Part I criteria, implementation, evidence and remaining gates |
| [Feedback and iteration log](docs/TEAM-FEEDBACK.md) | Findings linked to specific repairs |
| [Release status](docs/RELEASE-STATUS.md) | What is verified and what is pending |
| [Independent evaluation protocol](docs/evaluation/README.md) | Separate evaluator worksheets and usability records |
| [Contributions](docs/CONTRIBUTIONS.md) | Member-owned evidence records |
| [AI assistance log](docs/AI-USE-LOG.md) | Actual assistance and limits of verification |
| [Change log](CHANGELOG.md) | Current changes and historical version notes |
| [Security](SECURITY.md) | Controls, reporting and scope |
| [Contributing](CONTRIBUTING.md) | Review and evidence expectations |

Configuration, signing material, generated APKs, SDKs and dependencies are not committed. No historical Git commits or completed independent evaluations have been invented.
