# Randy feedback repair — v0.6.9 (29 September 2026)

This tester build branches from v0.6.2. It preserves Randy's current sign-in and admin access. It does not include the v0.6.3–v0.6.8 experimental encrypted-login/biometric/MFA work. Keep the biometric feature APK on the owner's feature-test phone; do not replace it with this tester build. The feature branch remains separate and needs this patch merged before its next release.

## Changes

- Customer and admin schedules offer 08:30, 10:00, 11:30, 13:00, 14:30, 16:00, 17:30 and 19:00 Monday–Friday. Saturday/Sunday additionally offer 20:00 and 21:00. These are appointment start times; existing booking durations and capacity rules are unchanged.
- Admin booking edits refresh the time options when the date changes and clear a weekend-only selection on a weekday.
- Bookings and the overview pending list sort by creation time, newest first. Month/search/status filters remain available.
- The top-right Customer/Admin button switches views for the same verified administrator, preserving the selected admin tab. It does not sign out or change anyone's role. Customers never receive admin controls.
- The payment picker displays the selected filename immediately.

## Confirmed live error and prepared repair

A read-only query of Clean Things Live found no payment-proofs bucket, no bookings.payment_proof_path column and no payment-image policies. The older update_my_booking function accepts filenames without linking a stored object. The availability RPC still returns six slots. No live mutation was made while preparing this update.

The [targeted migration](../supabase/migrations/202609290003_payment_schedule_hotfix.sql) adds a private bucket (JPEG/PNG/WebP, max 3 MiB), the proof-path column, owner/booking checks and owner/admin reads for linked proof images. It replaces the payment submission RPC with the already-tested object-linking implementation. Customers cannot overwrite/delete submitted proof. There is no public access and no admin role or MFA change. A reference-only MMG submission remains supported, without being treated as verified payment.

The same transaction supplies date-aware offered hours and whole-day blocking, validates new/rescheduled booking times, preserves previous complete day closures and updates exact fixed-list checks if the fuller repair already exists. Unrelated services, prices, settings, profiles and booking records are not rewritten.

**Live application is pending owner confirmation for the private-image access rules.** Install/distribute after that application and a real tester upload. The APK alone cannot create the missing storage bucket. Database tests exercise SQL object metadata and permissions; they do not upload image bytes through the hosted Storage API.

## Executed local verification

81 automated tests passed, including the targeted repair on the older schema and the full migration sequence. 116 browser state/timing inspections passed at 360/393/412 pixels in both themes, with zero selected-rule accessibility violations. Java/D8 compilation, ZIP asset comparison, APK signature verification and version-code inspection passed. Live Storage API upload and real-phone acceptance remain pending.

## Acceptance

1. Owner approves and applies the targeted transaction; verify private bucket configuration, new column, policies, weekday/weekend availability and unchanged admin-role enforcement.
2. On a customer test account, select an image smaller than 3 MiB, submit, then have the admin open View proof image. Another customer must not access it.
3. Book a weekday at 7 pm and a weekend at 9 pm; ensure another customer sees the chosen time occupied. Close an empty day and verify evening times are blocked.
4. Check newest bookings and walk-ins first, filters, and repeated Customer/Admin switches without signing in again.
5. Update MMG business details before accepting real payments: Randy's screenshot still shows the demonstration name and 000-0000. No real payment details were supplied or invented.

Android package gy.cleanthings.app, version code 21, original signing certificate retained. Automated browser fixtures and local SQL checks are evidence of regression coverage, not physical-device or production payment certification.
