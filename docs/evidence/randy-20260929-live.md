# Clean Things Live database repair — 29 September 2026

The owner explicitly approved applying the prepared database repair. The exact transaction in `supabase/migrations/202609290003_payment_schedule_hotfix.sql` was executed through the Supabase SQL editor. The editor returned “Success. No rows returned”.

## Live configuration verification

All seven checks returned PASS:

1. `payment-proofs` is private, limited to 3 MiB and JPEG/PNG/WebP.
2. `bookings.payment_proof_path` exists; `update_my_booking` validates stored-object linkage.
3. The two payment policies target authenticated users, and `storage.objects` has row-level security enabled.
4. Weekdays offer eight appointment start times, ending at 19:00.
5. Saturday and Sunday offer ten appointment start times each, ending at 21:00.
6. Anonymous execution is denied for `appointment_availability`, `update_my_booking` and `set_day_availability`.
7. The existing administrator-role check remains; staged administrator MFA was not activated.

A separate read-only transaction using the authenticated database role and a synthetic user claim called `appointment_availability` and returned:

| Date | Slots | Last appointment |
| --- | ---: | --- |
| 2026-10-02 | 8 | 19:00 |
| 2026-10-03 | 10 | 21:00 |
| 2026-10-04 | 10 | 21:00 |

The verification transaction was rolled back. No test users, bookings or payments were created. No credentials or administrator roles were changed.

## Remaining acceptance

These checks verify database configuration and RPC execution. They do not establish a successful real-phone image upload through the hosted Storage API. Randy should use v0.6.9 to upload a receipt, have an administrator open the linked image, and complete the acceptance steps in `docs/RANDY-FEEDBACK-v0.6.9.md`.

The owner’s biometric feature build remains separate. This deployment does not activate staged MFA or merge the tester branch into main.
