# Saved-login biometric sign-in — v0.6.10 candidate

This replaces the earlier app-lock feature with account sign-in using an explicitly saved login. No lock screen, Lock now button or background timeout remains. The sign-in page always shows the fingerprint button.

## User flow

1. Sign in with email/password and tick **Save login for biometric sign-in**. The checkbox starts unchecked.
2. After password verification succeeds, approve Android's biometric prompt to save the login encrypted on this phone. Cancelling this prompt still signs you in, but does not save a new login.
3. Sign out normally. The account session ends; the saved login stays on this device.
4. Tap the fingerprint **Sign in with biometrics** button. Approve fingerprint or supported secure face recognition. The app sends the saved login to the normal authentication endpoint and opens the account only after server validation.
5. **Forget saved login**, on the sign-in page or Account, removes this phone's saved login. It does not sign out an active session.

Only one login is saved per installation. Choosing Save login on another successful account sign-in replaces it after biometric approval. Signing into another account without ticking Save login leaves the existing saved login unchanged. Anyone with a qualifying biometric enrolled on this phone can use the saved login. The checkbox explains this.

Android 11+ and a strong biometric are required. Weaker face recognition may be unsupported even when fingerprint is available. This Android build does not implement Apple's Face ID/Touch ID APIs. Password access remains available. Biometrics do not provide offline account access or bypass server MFA. No database change is needed for saved-login sign-in.

## Upgrade and recovery

Install as an update using the original signature. If the old app-lock feature was enabled, sign in once with your password and tick Save login. An ordinary existing session continues normally without an app-lock prompt. A changed password or invalidated biometric key requires password sign-in and saving the login again. Forget an unreadable saved login before replacing it if necessary. Reset password remains available.

## Verification and remaining phone acceptance

Automated checks cover consent, password verification before saving, cancellation, encrypted-envelope authentication, pre-authentication AAD ordering, forged/stale callbacks, sign-out retention, forgetting without logout, fresh server authentication, identity binding, late network responses, ordinary session restoration and the administrator MFA gate. Browser fixtures cover the visible flow at 360/393/412 pixels in light and dark themes. These fixtures do not exercise a real Android biometric sensor or Keystore.

On a test phone, verify: install over the previous app; save/cancel/retry; sign out then biometric sign-in; force-stop/reopen without an app lock; background beyond one minute without an app lock; sensor lockout and password fallback; changed device biometrics; forgotten/changed password; saved-account replacement; Forget saved login while signed in and signed out; offline failure; account suspension; administrator access on the current live database; administrator MFA after biometric login in an enforced staging environment. Record model, Android version and any fixed BIO-* error code. Never share passwords or biometric data.

This build includes all v0.6.9 repairs: evening starts, private payment-image linking, newest-first admin records, and the Customer/Admin switch. It is signed as version code 22, so it can update both the owner's v0.6.8 and Randy's v0.6.9 installation. Install over the existing app; uninstalling clears saved logins.

Administrator MFA remains staged. Only HTTP 404 with PostgREST code PGRST202 from the status RPC identifies the pre-rollout backend. In that case, the app uses the existing role-based flow and does not show authenticator setup. This does not grant a role or bypass database permissions. Network failures, generic 404s, permission errors and malformed status responses block admin entry. Once the server enforces MFA, its verification gate still runs after password or biometric login. No production database/auth settings are changed for this biometric release.

The native implementation follows Android's [biometric cryptographic authentication guidance](https://developer.android.com/identity/sign-in/biometric-auth): a strong biometric authorises each use of the Keystore key; cryptographic data is processed only after authentication. Sensor/Keystore acceptance must still be recorded on a physical phone.
