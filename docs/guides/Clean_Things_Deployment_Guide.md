# Clean Things Deployment Guide

**Guide version 1.1 • 3 October 2026 • Technical operators and maintainers**

Use this guide to prepare, verify, distribute and recover the connected Android application. The inspected APK is **v0.6.10-live**, but the GitHub `main` branch currently contains **v0.6.2 source**. Reconcile the source, native code and database migrations before rebuilding or approving a wider rollout.

## 1. Release baseline and current evidence

| Item | Verified baseline |
| --- | --- |
| Saved APK | `CleanThings-Live-v0.6.10.apk` |
| Android identity | `gy.cleanthings.app`; versionName `0.6.10-live`; versionCode `22`; minimum API 24; target API 35 |
| GitHub source | `sjoseph26/clean-things`, source baseline originally observed at commit `45dad46533f4309dc7bc33b0a0c69cba6f13d7ac`; build script targets v0.6.2, code 14 |
| Later interface | Biometric sign-in, native session-storage bridge, Customer/Admin switch, structured add-ons and later slot pattern are present in the inspected APK |
| Database evidence | 29 September repair evidence records private proof storage, owner/admin access rules, evening slots and anonymous RPC denial; MFA was not activated |

The screenshot evidence is point-in-time repair evidence, not a fresh database audit. Actual phone biometric use, recovery completion, proof upload/opening, cross-account isolation and hosted restore still need release-specific results. Older tests do not establish that every later native change has passed.

### Release owner responsibilities

The release owner selects the exact source commit and APK, verifies the database version, controls the signing key, records the checks and authorises distribution. Business administrators manage operational data; their app role does not require access to deployment secrets.

Before rebuilding v0.6.10, recover the matching source and native signing/build history from the later development workspace. Commit it with reviewed migrations and tests. Do not copy extracted JavaScript into the older repository and call that a reproducible native build; the native biometric and storage bridge source must also match.

## 2. Prerequisites and configuration

### Architecture and required access

The APK bundles HTML, CSS and JavaScript in an Android WebView. Supabase provides Auth, PostgreSQL and private Storage. A separately hosted HTTPS recovery page handles password resets. OpenStreetMap supplies map tiles; optional WhatsApp alerts use Meta’s Cloud API. Updating the repository does not update an installed APK.

| Requirement | Preparation |
| --- | --- |
| Development tools | Git, Python 3, Node.js and npm. The checked repository specifies Node 22.12 or later and CI uses Node 24; install locked dependencies with `npm ci`. |
| Android build tools | JDK 17; Android SDK platform 35 and build-tools 35.0.1 for the checked build script. |
| Staging | Separate Supabase project with fictional customer A, customer B and an administrator. |
| Operator access | Authorised GitHub and Supabase access; original live signing keystore and alias; private access to SMTP, recovery hosting and optional Meta configuration. |
| Device checks | At least one supported Android device; compatible enrolled biometric device; internet and file-picker/location access. |

### Configure the public client

Set `CT_SUPABASE_URL`, `CT_SUPABASE_PUBLISHABLE_KEY` and `CT_PASSWORD_RESET_URL`, then run:

```bash
python3 scripts/configure.py
```

The generated `app/src/main/assets/config.js` is ignored by Git. Only public client configuration belongs in APK assets; service-role keys, database passwords, SMTP credentials, signing secrets and Meta tokens must remain outside the client and repository.

For a device-only demonstration, the checked script supports:

```bash
python3 scripts/configure.py --demo
```

This intentionally blanks the backend settings. CI’s QA workflow uses this mode, so its resulting APK is not a live customer distribution.

### Recovery and provider settings

Set Supabase’s Site URL and allowed redirects to the intended recovery handler and configure a working SMTP provider. Verify the chosen email-confirmation policy and password rules. Keep project configuration and recovery-page source under controlled maintenance; the recovery site source is not included in the checked Android repository.

## 3. Database, storage and authentication

### Apply reviewed migrations

1. Export a restorable database backup and the private Storage files before changing an existing project. Record the project identity, migration history and backup location.
2. Recover the exact SQL used for the 29 September repairs, compare it with the live definitions and place reviewed migrations in source control.
3. For a new staging project, apply the complete reviewed migration sequence in filename order. For an existing project, apply only missing migrations after checking tables, functions, policies and grants.
4. Inspect errors and transaction results. Verify booking creation/update RPCs, shared availability, whole-day/slot controls, receipt generation and the deployed evening-slot rule.
5. Create the intended administrator account through normal Auth, verify its identity and use the reviewed `seed-admin.sql` with its Auth UUID. Do not grant roles from untrusted sign-up metadata.

### Validate private image storage

The `payment-proofs` bucket should be private, accept JPEG/PNG/WebP and enforce the 3 MiB limit. Object paths identify the owning user and booking. The payment RPC must verify the uploaded object exists and belongs to that booking before storing its path.

Test the actual service: customer A uploads bytes; A and an administrator can retrieve the permitted image; customer B and anonymous callers cannot. Download and compare the bytes, then test signed-link expiry. Also test profile-photo storage. A successful metadata query or saved filename does not prove image upload and recovery.

### Authentication controls

The application handles rate-limit responses with retry countdowns and a separate recovery resend wait. Earlier evidence records a live token-request limit of 60 per five minutes per IP; verify the current provider setting before release.

Biometric sign-in in the later APK saves encrypted account credentials through a native bridge and uses them for a normal online sign-in after biometric verification. Review the matching native code, key handling, origin restrictions, cancellation and credential invalidation. Do not describe it as passkeys or passwordless server authentication.

Administrator MFA requires server enforcement as well as a screen. The repair evidence states it was not activated. Before enabling it, recover the planned migration, test Auth assurance-level checks on every privileged operation and prepare enrolment and recovery procedures.

## 4. Build, sign and identify the APK

### Reproduce the selected source first

At the observed source baseline, these commands build v0.6.2, not the later saved APK:

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Record command output and the exact commit. Browser and database fixture tests do not replace live-service and physical-device acceptance.

### Configure and compile a live build

1. Set `ANDROID_SDK_ROOT` to the installed SDK.
2. Set `CT_SIGNING_KEYSTORE` and `CT_KEY_ALIAS`. Supply `CT_STORE_PASSWORD` and `CT_KEY_PASSWORD` privately.
3. Keep the live package `gy.cleanthings.app`. For the next release, select an unused version name and version code higher than 22.
4. Run `bash build-apk.sh live`. Retain the original signing identity.
5. Inspect the built APK’s manifest, signature and configuration. Verify the bundled interface includes `session-store.js` and its matching native bridge when biometric sign-in is advertised.

```bash
apksigner verify --verbose --print-certs <release.apk>
aapt2 dump badging <release.apk>
sha256sum <release.apk>
```

### Reference artifact fingerprint

The saved candidate inspected for these guides has SHA-256:

```
aa20d0b9c4deb8d6f2771bb647f5c3955c159395c04ac4ef7620ecee6cade702
```

## 5. Acceptance, distribution and handover

Record the device, account role, source/build version, expected result, actual result and evidence for each check. Use fictional or specifically authorised test data. Mark incomplete checks as pending.

| Check | Acceptance evidence |
| --- | --- |
| Install and upgrade | Correct package/version; old live installation updates; email sign-in opens; old QA app is clearly distinguishable. |
| Accounts and recovery | Registration, password sign-in, sign-out, accepted recovery email, new-password login, expired-link and replay handling. |
| Biometric sign-in | Save with consent; sign out; authenticate and sign in; cancel/fallback; forget login; password change; unsupported device; enrolment changes. |
| Roles and MFA | Customer cannot read other accounts or call admin operations. Admin view stays stable. If MFA is enabled, AAL1 requests are denied server-side. |
| Bookings and schedule | Two customers compete for one slot; only one succeeds. Filters, add-ons, weekend times, day/slot blocking and request handling work. |
| Payment and receipts | Real image bytes upload privately; owner/admin access works; unrelated user denied; MMG review and completed/paid receipt linkage pass. |
| Phone operation | GPS allow/deny, manual pin, file picker, Android Back, light/dark mode, pull-to-refresh, restart and network failure are checked. |
| Performance and recovery | Measure normal-network response times against approved criteria. Restore database and Storage files and reconcile results. |

### Publish one approved download

1. Commit the matching source, migrations, test evidence and guides. Tag the exact release commit and publish the signed APK with its SHA-256 and release notes.
2. Keep the repository private unless the owner approves otherwise.
3. Label the live APK clearly. Keep demo/QA downloads separate and identify old builds as superseded.
4. Release to a small named tester group first. Provide the User Guide, collect installation and workflow results, and expand only after the release owner accepts them.

Handover includes the approved download location, manifest version/code, hash, source commit, migration record, known limitations, support contact, backup locations and accountable maintainers. Signing and provider secrets are transferred privately.

## 6. Operations, recovery and rollback

Assign an operator to monitor Supabase availability, authentication errors, failed booking/payment requests, storage usage and recovery-email delivery. Record recurring faults with timestamps and versions. Agree backup frequency and retention with the business; perform a backup before every database release.

### Back up and restore

1. Capture the database using the backup/export method available for the project plan. Separately copy private Storage object bytes, including payment proofs and profile photos, with a path-and-hash manifest.
2. Record source version, migration state, relevant Auth/redirect configuration and object counts. Encrypt and restrict access to backups; keep them outside Git.
3. Restore into an isolated project first using the provider’s supported procedure. Restore Storage bytes and reconcile object paths with the database metadata.
4. Compare booking and receipt counts, links, payment amounts and object hashes. Recheck grants, RLS, customer isolation and administrator access.
5. Measure restore time and the interval of lost writes. Obtain the release owner’s acceptance before redirecting users or reopening the recovered service.

Supabase database backups contain Storage metadata, not the actual uploaded files. A database-only restore cannot establish recovery of proof images.

### Rollback and incident handling

Stop distribution when installation, access control, booking integrity or payment evidence fails acceptance. Preserve error evidence. For an application regression, keep compatible additive database changes and issue a tested corrective build signed with the original key and a higher version code.

For data corruption, stop affected writes where practicable, capture the current state and use the approved restore plan. Reconcile legitimate transactions since the recovery point before returning to service.

### Maintenance references

- Source repository: `sjoseph26/clean-things`
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Supabase redirects: https://supabase.com/docs/guides/auth/redirect-urls
- Android signing: https://developer.android.com/studio/publish/app-signing

## 7. Submission status and future work

Submission date: **3 October 2026**. The existing v0.6.10-live APK is frozen for submission. This revision updates documentation only; no app, backend or payment behaviour was changed.

### Current operating behaviour

| Area | Submission status |
| --- | --- |
| Location | Current location works after turning on the phone’s Location setting and allowing app location permission. This is user-reported confirmation, not a new code fix or independent device test. |
| Booking cancellation | Customers submit a cancellation request for administrator review. This does not immediately delete or cancel the booking, charge a fee or refund money. |
| MMG payments | Customers transfer through MMG separately and submit a reference or proof image. Administrators verify against actual MMG records. API checkout and automatic refunds are not active. |
| Receipt sharing | Eligible receipts offer Email and WhatsApp sharing through an external app. The sender checks the recipient and sends manually; automatic receipt delivery is not active. |

### Agreed cancellation enhancement

Future requirement only: a request submitted less than 24 hours before the appointment incurs a proposed fee of **15%** of the booking total. At exactly 24 hours or earlier, no cancellation fee applies. The frozen submission does not calculate or enforce this rule.

### MMG integration readiness

The supplied `mmg-integration-skill.zip` contains a planning guide and example code with placeholder API details. It is not a merchant API contract or verified integration. Official MMG endpoint, authentication, payment-status and refund specifications plus sandbox access are still needed.

### Repository and artifact handover

Use `docs/guides` for the submission guides and `submission/CleanThings-Live-v0.6.10.apk` for the unchanged APK when the binary artifact is added. The application source remains at the v0.6.2 baseline; the complete matching v0.6.10 native source has not been recovered. Do not rebuild the older source and distribute it as this APK.
