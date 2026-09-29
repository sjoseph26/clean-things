# Change log

## 0.6.1 - 29 September 2026

- Replace the large refresh button with pull-to-refresh on live browsing screens.
- Show a compact loading indicator, prevent concurrent refreshes and preserve unfinished forms.
- Retain a keyboard/screen-reader refresh action and respect reduced-motion preferences.
- Increment Android version code to 13, retaining the existing app identity and signing certificate.
- Physical Android gesture testing remains outstanding.

## 0.6.0 security follow-up - 29 September 2026

- Respect authentication rate-limit responses with a retry countdown that survives page reloads; keep login and recovery waits separate.
- Add a recovery resend interval and generic credential/server-failure messages.
- Add eight automated authentication/recovery cases and record live throttling evidence. The server token-request limit is now 60 requests per five minutes per IP.
- Recovery email request accepted; inbox delivery, new-password submission and expired/used-token checks remain unverified. No administrator password or role was changed.
- Replace local demo credentials with role-selection buttons; preserve the verified Android CI SDK path.

## 0.6.0 candidate - 21 September 2026

- Repaired audited F01-F14 startup, map, validation, failed-write, logout, timeout, availability and duplicate-submit defects; added executable regression evidence.
- Corrected selected-slot/success contrast and light warning badges; added measured mobile browser checks.
- Added private payment-proof upload, ownership/path validation, idempotent booking creation, shared availability and atomic administrator changes in a new unapplied migration.
- Compiled native Java with an HTTPS bundled-content origin and restricted geolocation/asset access; build code 12.
- Added GitHub import guidance/CI, exact test traceability, honest acceptance gates and blank independent evaluation/contribution records.
- Removed personal administrator bootstrap data and obsolete asset-only APK repacking from distributable source.
- Status: local repair candidate. Live migration, real-device/service checks and GitHub publication remain pending.

## Historical release notes

The notes below are retained from the prior package as historical claims, not new verification. The v0.5.5 audit found remaining defects despite earlier contrast/location claims. Use the current release evidence and limitations rather than treating those historical statements as certification.

## 0.5.5-live - 1 September 2026

- Improved dark-mode contrast for primary and secondary text, navigation, cards, forms, buttons, badges, callouts, booking references, modals and administrator controls.
- Replaced light-only component backgrounds with theme-aware control surfaces.
- Added readable dark-mode success, warning, error, information and administrator accent colours.
- Added automated WCAG AA contrast checks for the main dark-mode colour pairs.
- Preserved the GPS-centred draggable pin and native Android location permission bridge from 0.5.4.
- Increased the Android version code so the update installs directly over 0.5.4-live.

## 0.5.4-live - 1 September 2026

- Added **Pin my current location** to the on-location booking form.
- Added **Use my current location** inside the map picker so GPS centres the map and places the draggable pin at the phone's position.
- Kept tap, drag and manual coordinates available when permission is declined or GPS is unavailable.
- Compiled the Android geolocation permission bridge into the APK so the runtime permission prompt can reach the embedded booking interface.
- Increased the Android version code so the location update installs directly over 0.5.3-live.

## 0.5.3-live - 1 September 2026

- Fixed successful email-confirmation registrations being incorrectly displayed as “The account could not be created.”
- Added support for both valid Supabase sign-up response formats: a nested user/session response and a direct pending-user response.
- Preserved duplicate-account detection and the visible password, email and rate-limit guidance from 0.5.2.

## 0.5.2-live - 1 September 2026

- Added visible account-creation requirements for email, telephone and password fields.
- Added a confirm-password field and required passwords to contain at least eight characters, one letter and one number.
- Normalised email addresses to lowercase before account creation.
- Added specific guidance for duplicate emails, password errors, email limits and confirmation-email delivery failures.
- Prevented repeated Create account taps while a request is being processed.
- Clarified the one-minute interval before requesting another confirmation email for the same address.

## 0.5.1-live - 1 September 2026

- Added approximate and precise location declarations to the packaged Android manifest so Clean Things appears in the phone's Location permission list.
- Prepared native WebView runtime-permission handling in the maintained Android source for a future full SDK build.
- Added an in-app OpenStreetMap picker with tap, drag, zoom and manual latitude/longitude entry.
- Made the manual map picker the dependable location workflow for this repair package.
- Increased the Android version code so the repair installs as an update over 0.5.0-live.

## 0.5.0-live - 31 August 2026

- Replaced the separate administrator login with one role-based account sign-in.
- Removed the administrator email from the packaged configuration and all signed-out screens.
- Redirected signed-out booking attempts to sign in or account creation while keeping service browsing public.
- Restricted the booking RPC to authenticated users so older clients cannot submit guest bookings.
- Applied and verified the authenticated-booking restriction in the live Supabase project.
- Improved account-creation validation and added a persistent email-confirmation message.
- Clarified that the prototype WhatsApp integration alerts the configured administrator only.
- Clarified that Meta's Facebook Graph endpoint supports WhatsApp Cloud API; there is no Facebook feature in the app.
- Repaired and expanded the source-package documentation index and added an automated check for broken relative links, missing required files and accidentally packaged signing/secret files.

## 0.4.0-live - 31 August 2026

- Added a direct Edit services shortcut to the Admin Management overview.
- Expanded service editing to cover name, icon, duration, price, description, included items, add-ons, popular status, display order and customer visibility.
- Added customer profile-photo upload, secure private storage, signed photo display and photo removal.
- Limited profile images to JPEG, PNG or WebP files of 3 MB or less.

## 0.3.1-live - 31 August 2026

- Fixed the close button and other action buttons inside modal sheets, including the Admin Management booking editor.
- Preserved the existing Android signing certificate so this repair build installs as an upgrade over 0.3.0-live.
- Added an automated check that opens and closes the admin booking editor.
- Added the missing Supabase API table grants while retaining row-level security controls.

## 0.3.0-live - 30 August 2026

- Added Supabase email/password authentication, PostgreSQL storage and row-level security.
- Connected the Admin Management Dashboard to shared bookings, customers, schedule, services, receipts and settings.
- Added server-side booking validation and WhatsApp Cloud API alerts to the configured administrator number.
- Added support for Meta's WhatsApp test-number template during prototype testing.
- Added restricted customer booking actions so customers cannot change prices, booking status or payment approval.
- Protected profile roles against customer self-promotion to administrator.
- Retained setup mode so the UI remains demonstrable until cloud credentials are configured.
- Rebuilt the final APK with Android Signature Scheme v2 after Samsung reported the earlier package as invalid.

## 0.2.1-prototype - 30 August 2026

- Removed the remaining internal Owner terminology from the customer-account interface.
- Increased the Android version code so installed prototype builds are upgraded reliably.

## 0.2.0-prototype - 30 August 2026

- Replaced the customer-facing Owner tab with a Customer Account area and added local sign-in/account creation.
- Added a separate Admin Management Dashboard with overview indicators and mobile admin navigation.
- Implemented service, price and visibility administration; booking search/edit/delete; customer editing; and business/MMG settings (FR-12).
- Added date/slot availability controls linked to the customer booking calendar.
- Added payment-review controls, walk-in recording and receipt-sharing options.
- Added light/dark appearance switching and optional location-pin capture/manual coordinates.
- Retained all data locally for fictional classroom evaluation; backend synchronisation and production authentication remain deferred.

## 0.1.0-prototype - 26 August 2026

- Added responsive service catalogue and package customisation (FR-1, FR-2, FR-7).
- Added wash-bay and on-location booking with available slots, validation and conditional fields (FR-3 to FR-6).
- Added demo MMG instructions and payment-evidence submission linked to a booking (FR-8 to FR-10).
- Added customer cancellation/rescheduling requests (FR-11).
- Added admin demo workspace for booking lifecycle, walk-ins, cash/MMG payment states, verification and receipts (FR-13 to FR-17).
- Deferred live service/price/availability administration (part of FR-12) until stakeholder feedback; implemented locally in 0.2.
- Deferred backend synchronisation, production authentication, live MMG integration and notifications.
