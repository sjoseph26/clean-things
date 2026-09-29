# Biometric unlock — v0.6.7 feature candidate

Status: implemented, compiled and tested with JVM/JavaScript/browser fixtures. **Real Android biometric and lifecycle acceptance is still required.** No live database or auth configuration was changed. The feature branch builds on administrator MFA, which is still awaiting its coordinated server rollout.

## v0.6.6 retry after the phone report

The v0.6.5 phone screenshot reported “Secure sign-in storage is unavailable” while enabling biometrics. Source review found AAD was sent to an auth-per-use Keystore operation before biometric approval. Android can cache that failure and surface it later during finalization. The hotfix moves AAD into authenticated envelope creation/unwrapping, which run only in the success callback. A host fixture reproduces this ordering failure; no device exception log was available, so a real-phone retry remains necessary to confirm the reported failure is resolved.

Install v0.6.6 as an update over v0.6.5, reopen Account → Sign-in protection and try Enable biometric unlock again. No uninstall or data reset is required for the update. If it fails, record the fixed BIO-* stage code now shown and the phone/Android version. Do not share sign-in credentials or biometric data.

## Sign-in page (v0.6.7)

The sign-in page now displays a fingerprint icon and **Sign in with biometrics** above the password fields. When no protected saved session exists, tapping it explains that the user must sign in with a password and enable biometrics in Account → Sign-in protection first. It does not create an account/session or open a non-functional native prompt. A supported protected saved session presents the same icon/button on its unlock screen and invokes the existing authenticated native flow. Unsupported devices show an inline explanation and retain password access. Explicit sign-out still deletes the saved session and biometric setting.

## User flow

1. Sign in normally. Administrators must also satisfy the separate live MFA requirement.
2. Open Account → Sign-in protection → Enable biometric unlock.
3. Verify using Android's fingerprint or supported secure face prompt. All qualifying biometrics enrolled on this device can unlock the saved account; use a personal device.
4. On an app restart, after Lock now, or on returning after at least one minute in the background, choose Unlock with biometrics. The app then checks session validity and current account privileges. Internet access is needed to load the account; biometrics do not provide offline management access.
5. To use a password instead, choose Use password sign-in. This removes the saved session and biometric preference from the device, then presents normal sign-in. After successful sign-in, enable biometrics again if wanted.
6. Turning off biometric unlock requires a fresh Android verification. Signing out removes the saved session and biometric setting.

The biometric feature requires Android 11+ and a biometric Android accepts as `BIOMETRIC_STRONG`. Devices with only weaker face recognition may support fingerprint instead. Older/unsupported devices continue with password sign-in and ordinary encrypted storage. Fingerprint/face data never enters the app or backend. No device PIN fallback unlocks the stored app session; use the app account password fallback.

## Required real-phone acceptance

Use a test customer first, then a staging administrator with server MFA activated. Never post passwords, authenticator secrets or codes into chat.

- Upgrade from the current app using the original signature; existing session restores normally until biometric opt-in.
- Enable with a successful biometric; cancel setup and retry; failed/unsupported recognition must not enable protection.
- Force-stop/reopen and Lock now: no profile/booking data before unlock; cancel/fail/succeed and test temporary sensor lockout.
- Background for under and over 60 seconds, including screen lock, Home, Android Back, activity/process recreation and restart. Over 60 seconds must show the gate on return. There is no foreground idle timeout.
- Check app screenshots and recent-app previews while enabled. Verify system biometric UI is accessible and its cancel button works.
- Rotate an expired token after unlock, restart again and confirm the new session restores. Simultaneous refresh and verification must not overwrite refreshed credentials.
- Change biometric enrolments or remove the screen lock: invalidated keys must fail closed. Use password fallback, sign in and enable again.
- Test switching accounts: the next account must opt in independently. Sign-out, cancellation and a late prompt callback must not restore the old account.
- Turn biometrics off with verification; cancel opt-out and ensure protection stays on. Confirm normal encrypted restoration after opt-out.
- Test proof-image/avatar file pickers and location permissions. A file picker open for over 60 seconds can be interrupted by the return lock; choose the file again after unlocking.
- With networking unavailable after successful device recognition, keep private records hidden and offer retry/password controls.
- Admin unlock must still invoke the server MFA/role check. Test AAL1, revoked role, missing factor, expired/revoked session and missing MFA rollout; none may expose admin management.

## Implementation and limits

AES-256-GCM encrypts the session with a random per-session data key. A Keystore auth-per-operation strong-biometric key wraps that data key; both the wrapping and payload are authenticated. Atomic replacement precedes deleting the ordinary encryption key. Token renewal uses only the already-unwrapped in-memory data key. Code/password fallback cannot decrypt the protected ciphertext; it erases it before a fresh sign-in.

While foregrounded or within the one-minute background grace period, the session and unwrapped data key remain in memory. On return after the grace period, the Activity retires the old bridge and starts a fresh locked document; this is not an immediate background memory wipe. Runtime XSS or OS compromise is not solved by storage encryption. Auth callback and storage behaviour are automatically tested with fixtures, but no actual Keystore/TEE or biometric sensor was exercised here.

Before coordinated release, complete these checks and record phone model/Android version, account role, expected/actual results and any fixes. Keep the current tester APK until both this acceptance and the separate [administrator MFA rollout](ADMIN-MFA-ROLLOUT.md) are ready.
