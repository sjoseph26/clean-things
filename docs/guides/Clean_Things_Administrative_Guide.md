# Clean Things Administrative Guide

**Guide version 1.1 • 3 October 2026 • Authorised business administrators**  
**App:** v0.6.10-live candidate

Use this guide to manage bookings, availability, services, customers and payment review in the v0.6.10 live candidate. Administrators sign in through the normal account screen. Access is assigned to a verified account by the system operator; there is no shared demo administrator password for the live service.

## 1. Sign in and open management

1. Install `CleanThings-Live-v0.6.10.apk` using the User Guide. Open Account and sign in with your own authorised email and password.
2. Open **Management access** and the management button in Account, or use **Admin** in the header when available.
3. Confirm that Admin Management and the business records load. If the account remains a customer, ask the system operator to verify its server-side role.
4. Use **Customer** in the header to switch to the customer view, then **Admin** to return. Switching views is not signing out.
5. At the end of work, select **Sign out**. On a shared phone, also use **Forget saved login** if a biometric login was saved.

If you return unexpectedly to the customer view, check Account and use the Admin switch if still authorised. If sign-in is required, sign in again. Record recurring errors for the technical operator; do not create another administrator account as a workaround.

### Management navigation

| Area | Use |
| --- | --- |
| Overview | See pending confirmations, upcoming bookings, payment reviews and recorded paid revenue. |
| Bookings | Search, filter, review and update appointment records. |
| Schedule | Open or block a day or an individual slot. |
| Customers | View customer details, booking counts and paid totals. |
| More | Open Services & pricing, Payment review, Business settings or Record walk-in. |

Daily routine: check new requests and payment evidence, confirm the day’s schedule, carry out services, update completed work, then reconcile recorded payments against actual receipts. Paid revenue is the sum recorded in the app, not a bank or MMG settlement report.

## 2. Review and maintain bookings

### Find the correct record

Open **Bookings**. Records are ordered newest first by creation time. Search by customer name, telephone, vehicle, registration or booking reference. Combine the search with the status selector and **Booking month**. The month uses the appointment date, or the recorded date for walk-ins. Select **All months** and clear other filters if an expected record is missing.

### Confirm and edit appointments

1. Open the booking card and check the reference, service, customer, date/time, vehicle, location and any change request.
2. Select **Confirm** to accept a pending appointment. Booking confirmation and payment verification are separate actions.
3. Select **Edit** to correct a record. Available fields include customer, telephone, service, date, time, status, total in GYD and Admin notes.
4. Check the time again after changing the date, especially between weekdays and weekends. A blocked or occupied slot must be resolved before saving.
5. Tap **Save booking changes** once. Wait for confirmation, then reopen or refresh the record to verify the saved details.

Customer profile changes and booking-record changes are different operations. Correct the particular booking when its appointment details are wrong. Explain agreed price or service changes in Admin notes and to the customer; do not assume editing a service catalogue item recalculates an existing booking.

### Rescheduling, cancellation and completion

A customer’s **Reschedule** or **Cancel** action creates a request for review. For a reschedule, agree a new slot, select Edit, change date/time and save. For cancellation, review the request and select Cancel on the correct booking. Check that the request indicator and status reflect the final decision.

Select **Complete** only after the service is finished. Confirm payment separately. A digital receipt is expected when both Completed and Paid conditions are met; refresh if the record saved but the receipt did not load.

### Protect completed records

The database may reject financial or status edits to a transaction that already has a receipt. Use an agreed adjustment process with the technical operator instead of deleting it to bypass the restriction. A cancellation does not automatically refund an MMG payment.

Delete opens a separate Delete booking confirmation. Delete permanently removes the booking and linked receipt from the shared system. Prefer cancellation for a legitimate booking that will not proceed. Use deletion only for an authorised correction and retain a record of the reason; there is no in-app undo procedure documented for it.

## 3. Availability, services and customer records

### Open or block availability

1. Select **Schedule** and choose **Manage date**.
2. Tap an open slot to block it, or a blocked slot to reopen it. Booked slots cannot be blocked until the booking is moved or cancelled.
3. Use **Close this entire day** only after resolving the day’s active bookings. The app disables closing when affected bookings remain.
4. Use **Open this day** to reopen a closed day. This also clears the stored slot blocks for that date in the candidate; reapply any individual blocks that should remain.
5. Verify the availability from a customer account after saving. Do not rely only on the colour of the administrator button.

The current slot pattern is 8:30 am, 10:00 am, 11:30 am, 1:00 pm, 2:30 pm, 4:00 pm, 5:30 pm and 7:00 pm, with 8:00 pm and 9:00 pm added on Saturdays and Sundays. These are start times.

### Create or change a service

1. Open **More**, then **Services & pricing**, or select **Edit services** from Overview. Choose **+ Service** or **Edit** on an existing package.
2. Enter the service name, icon, duration, description, Price (GYD) and display order. In What is included, enter at least one item, one per line.
3. Under Optional add-ons, select **+ Add add-on**. Give each add-on a Name, Description and Price (GYD). A name and non-negative price are required. Remove unused rows with Remove add-on.
4. Use **Mark as popular** where appropriate, then select Add service or Save service. Check the customer catalogue and booking total afterwards.
5. Use **Hide** to remove a service from customer selection, or **Show** to make it available again. Existing bookings remain separate records.

### Update a customer

Open **Customers**, select **View / edit customer**, correct the name, telephone, vehicle, registration or location and select **Save customer**. The login email is read-only. Walk-in details without a linked account must be edited through their booking. Updating the customer profile does not automatically rewrite every historical booking.

## 4. Payments, receipts and business settings

### Review MMG evidence

1. Open More → **Payment review**, or the payment-review count on Overview. Select the booking by its reference.
2. Read the MMG transaction reference and amount. If **View proof image** is available, open it and check the evidence.
3. Compare the evidence with the actual business MMG transaction record. Check the recipient, amount, transaction identifier and whether the payment has already been used for another booking.
4. Select **Verify MMG** only when the funds and reference are confirmed. Select **Reject** when the evidence is incorrect or cannot be verified, then contact the customer using the agreed business channel.
5. Refresh and confirm the resulting payment status. Complete the service separately; a paid record alone does not mean the work is finished.

Proof images are private and opened through temporary links. If a link expires, return to the booking and select View proof image again. Do not make the bucket public to solve an access error. A filename with no stored image may need customer resubmission; do not mark it verified solely because a filename appears.

### Record a paid walk-in

1. Select **Add walk-in** on Overview, **+ Walk-in** in Bookings, or **Record walk-in** under More.
2. Replace the sample customer and vehicle text with the actual details. Select the service and Payment method, Cash or MMG.
3. Check the service price and confirm the payment was actually received. This form records a completed, paid transaction.
4. Select **Save paid walk-in**, then verify the record and receipt. Do not use it to represent an unpaid future appointment.

The inspected customer payment flow is MMG evidence submission. The explicit cash option is in the paid walk-in form. For cash paid against an existing online booking, use only an operator-approved procedure that keeps the original reference and prevents duplicate revenue.

### Receipts and settings

Select **Receipt** on an eligible record to review its number, booking, amount and method. Email or WhatsApp prepares a sharing action; check the recipient before sending. Do not assume automated notifications have been delivered because the booking saved.

Open More → **Business settings** to edit Business name, MMG account name and MMG number. Select Save settings and check the customer payment screen. Independently verify changed payment details before accepting transfers. The appearance control changes the app theme.

## 5. Security, daily controls and support

### Biometric access

On a private compatible phone, follow the User Guide to save a login and use **Sign in with biometrics**. Signing out retains that saved login. Use **Forget saved login** before lending or disposing of the phone, then sign out. All enrolled device biometrics may unlock it. Biometric sign-in does not grant an administrator role and does not replace a server-enforced authenticator check.

### Authenticator verification when activated

The v0.6.10 interface contains administrator authenticator screens. The latest inspected database repair evidence, dated 29 September, explicitly states that MFA was **not activated**. Therefore these steps apply only after the system operator enables and validates enforcement.

1. If Administrator verification appears, choose **Set up authenticator** and scan its QR code with your authenticator app. On the same phone, use **Show manual setup key** if needed.
2. Enter the current six-digit code and select **Verify code**. Keep the setup key private. Initial verification may end other sessions.
3. On later sign-ins, select the appropriate authenticator if more than one exists and enter its current code.
4. If verification fails, check the phone’s automatic date/time, use a current code and wait for any retry timer.
5. If every authenticator is lost, contact the system owner for an identity-checked reset. A password reset does not remove authenticator verification.

### Daily checks

- **Start:** verify live access, inspect new confirmations and change requests, review unpaid or pending payments, and confirm today’s schedule.
- **During work:** save once, check success, refresh uncertain results before retrying and record agreed changes in the appropriate booking.
- **Close:** reconcile Cash and MMG totals with actual receipts, review unfinished bookings and sign out of shared devices.

### Escalate an incident

Send the technical operator the app version, affected reference, time, screen, exact error and steps to reproduce it. Hide unnecessary customer and payment details. For suspected account misuse, stop using the affected session and request an access review. For missing records or receipts, preserve evidence and avoid deletion or bulk corrections until the cause is understood.

## 6. Submission status and future work

Submission date: **3 October 2026**. The existing v0.6.10-live APK is frozen for submission. This revision updates documentation only; no app, backend or payment behaviour was changed.

### Current operating behaviour

| Area | Submission status |
| --- | --- |
| Location | Current location works after turning on the phone’s Location setting and allowing app location permission. This is user-reported confirmation, not a new code fix or independent device test. |
| Booking cancellation | Customers submit a cancellation request for administrator review. This does not immediately delete or cancel the booking, charge a fee or refund money. |
| MMG payments | Customers transfer through MMG separately and submit a reference or proof image. Administrators verify against actual MMG records. API checkout and automatic refunds are not active. |
| Receipt sharing | Eligible receipts offer Email and WhatsApp sharing through an external app. The sender checks the recipient and sends manually; automatic receipt delivery is not active. |

### Agreed cancellation enhancement

Future requirement only: a request submitted **less than 24 hours** before the appointment incurs a proposed fee of **15%** of the booking total. At exactly 24 hours or earlier, no cancellation fee applies. Use the customer’s request submission time, not the time an administrator processes it. For a fully paid late cancellation, the proposed refund is 85% of the total.

The frozen submission does not calculate or enforce this rule.

### MMG integration readiness

The supplied `mmg-integration-skill.zip` contains a planning guide and example code with placeholder API details. It is not a merchant API contract or verified integration. Official MMG endpoint, authentication, payment-status and refund specifications plus sandbox access are still needed before implementation and testing.

### Submission operating instruction

Continue the current administrator review and payment-evidence procedures. Record customer requests and agreed outcomes clearly, preserve financial records, and do not represent future automation as available. The deployment guide records the source and APK version difference for technical handover.
