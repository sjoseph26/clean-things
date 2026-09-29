package gy.cleanthings.app;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Only exposed to the bundled, frame-free document. No passwords, biometrics or tokens are logged. */
public final class SessionVault {
    private static final String KEY_ALIAS = "CleanThings.session.v1";
    private static final String BIO_ALIAS = "CleanThings.biometric.v1";
    private final AtomicFile file;
    private final Activity activity;
    private final Consumer<String> callback;
    private volatile boolean trustedDocument;
    private SecretKey unlockedKey;
    private CancellationSignal cancellation;
    private long generation;

    SessionVault(Activity activity, Consumer<String> callback) {
        this.activity = activity; this.callback = callback;
        file = new AtomicFile(new File(activity.getNoBackupFilesDir(), "session-v1.enc"));
    }
    synchronized void setTrustedDocument(boolean trusted) {
        if (!trusted) cancelAndLock();
        trustedDocument = trusted;
    }
    private void cancelAndLock() {
        generation++;
        CancellationSignal pending = cancellation; cancellation = null; unlockedKey = null;
        if (pending != null) pending.cancel();
    }
    private KeyStore keyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); return store;
    }
    private SecretKey key(boolean create) throws Exception {
        SecretKey existing = (SecretKey) keyStore().getKey(KEY_ALIAS, null);
        if (existing != null || !create) return existing;
        return generateKey(KEY_ALIAS, false);
    }
    private SecretKey generateKey(String alias, boolean biometric) throws Exception {
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true);
        if (biometric) {
            if (Build.VERSION.SDK_INT < 30) throw new IllegalStateException("Unsupported device");
            spec.setUserAuthenticationRequired(true).setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec.build()); return generator.generateKey();
    }
    private boolean exists() {
        return file.getBaseFile().exists() || new File(file.getBaseFile().getPath() + ".bak").exists();
    }
    private byte[] saved() throws Exception {
        if (!exists()) return null;
        if (file.getBaseFile().length() > 65632) throw new IllegalStateException("Oversized session");
        return file.readFully();
    }
    synchronized boolean biometricEnabled() {
        try { byte[] data = saved(); return data != null && BiometricEnvelope.matches(data); }
        catch (Exception error) { return true; } // Fail closed on unreadable storage.
    }
    private String failure() { return failure("storage", "Secure sign-in storage is unavailable. Sign in again to reset it."); }
    private String failure(String code, String message) {
        return "{\"ok\":false,\"code\":" + JSONObject.quote(code) + ",\"error\":" + JSONObject.quote(message) + "}";
    }
    private String success(String value) { return "{\"ok\":true,\"value\":" + (value == null ? "null" : JSONObject.quote(value)) + "}"; }
    private void validate(String value) throws Exception {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 65536) throw new IllegalArgumentException("Invalid session");
        JSONObject session = new JSONObject(value);
        if (session.getString("access_token").isEmpty() || session.getString("refresh_token").isEmpty()
            || session.getJSONObject("user").getString("id").isEmpty()) throw new IllegalArgumentException("Invalid session");
    }
    private void persist(byte[] encrypted) throws Exception {
        FileOutputStream output = null;
        try {
            output = file.startWrite(); output.write(encrypted); file.finishWrite(output); output = null;
            if (!Arrays.equals(encrypted, file.readFully())) throw new IllegalStateException("Write failed");
        } finally { if (output != null) file.failWrite(output); }
    }
    private String plain(byte[] data) throws Exception {
        if (data == null) return null;
        byte[] bytes = BiometricEnvelope.matches(data) ? BiometricEnvelope.decrypt(unlockedKey, data) : SessionCipher.decrypt(key(false), data);
        try { String value = new String(bytes, StandardCharsets.UTF_8); validate(value); return value; }
        finally { Arrays.fill(bytes, (byte) 0); }
    }
    @JavascriptInterface
    public synchronized String read() {
        if (!trustedDocument) return failure();
        try {
            byte[] data = saved();
            if (data != null && BiometricEnvelope.matches(data) && unlockedKey == null)
                return failure("locked", "Unlock your saved sign-in first.");
            return success(plain(data));
        } catch (Exception error) { return failure(); }
    }
    @JavascriptInterface
    public synchronized String write(String value) {
        if (!trustedDocument) return failure();
        if (cancellation != null) return failure("busy", "Finish biometric verification first.");
        try {
            validate(value); byte[] data = saved();
            if (data != null && BiometricEnvelope.matches(data)) {
                if (unlockedKey == null) return failure("locked", "Unlock your saved sign-in first.");
                // A different account must opt in separately, never inherit another account's preference.
                String oldUser = new JSONObject(plain(data)).getJSONObject("user").getString("id");
                if (!oldUser.equals(new JSONObject(value).getJSONObject("user").getString("id")))
                    return failure("locked", "Sign out before changing accounts.");
                persist(BiometricEnvelope.replace(unlockedKey, data, value.getBytes(StandardCharsets.UTF_8)));
            } else persist(SessionCipher.encrypt(key(true), value.getBytes(StandardCharsets.UTF_8)));
            return success(null);
        } catch (Exception error) { return failure(); }
    }
    @JavascriptInterface
    public synchronized String clear() {
        if (!trustedDocument) return failure();
        cancelAndLock(); boolean keysRemoved = false;
        try { KeyStore store = keyStore(); store.deleteEntry(KEY_ALIAS); store.deleteEntry(BIO_ALIAS); keysRemoved = true; }
        catch (Exception error) { /* Still remove the ciphertext. */ }
        file.delete(); return keysRemoved && !exists() ? success(null) : failure();
    }
    private String unavailableReason() {
        if (Build.VERSION.SDK_INT < 30) return "Biometric unlock requires Android 11 or later. Password sign-in is available.";
        BiometricManager manager = activity.getSystemService(BiometricManager.class);
        if (manager == null) return "Biometrics are unavailable on this device.";
        int code = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (code == BiometricManager.BIOMETRIC_SUCCESS) return "";
        if (code == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return "Set up a secure fingerprint or supported face unlock in Android Settings first.";
        return "A supported secure biometric is unavailable. Use password sign-in or try again later.";
    }
    @JavascriptInterface
    public synchronized String biometricStatus() {
        if (!trustedDocument) return failure();
        String reason = unavailableReason(); boolean enabled = biometricEnabled();
        return "{\"ok\":true,\"value\":{\"available\":" + reason.isEmpty() + ",\"enabled\":" + enabled
            + ",\"locked\":" + (enabled && unlockedKey == null) + ",\"reason\":" + JSONObject.quote(reason) + "}}";
    }
    @JavascriptInterface
    public synchronized String biometric(String action, String id) {
        if (!trustedDocument) return failure();
        if (id == null || !id.matches("[a-zA-Z0-9-]{1,80}") || !("enable".equals(action) || "unlock".equals(action) || "disable".equals(action))) return failure();
        if (cancellation != null) return failure("busy", "Biometric verification is already open.");
        String reason = unavailableReason(); if (!reason.isEmpty()) return failure("unavailable", reason);
        final long requestGeneration = ++generation;
        cancellation = new CancellationSignal();
        activity.runOnUiThread(() -> startBiometric(action, id, requestGeneration));
        return success(null);
    }
    @JavascriptInterface
    public synchronized String cancelBiometric() {
        if (!trustedDocument) return failure();
        cancelAndLock(); return success(null);
    }
    private synchronized void finish(String id, long expected, String result) {
        if (!trustedDocument || expected != generation) return;
        cancellation = null;
        callback.accept("{\"id\":" + JSONObject.quote(id) + ",\"result\":" + result + "}");
    }
    private synchronized void startBiometric(String action, String id, long expected) {
        if (!trustedDocument || expected != generation || cancellation == null || Build.VERSION.SDK_INT < 30) return;
        try {
            final byte[] data = saved(); final boolean enabling = "enable".equals(action);
            if (data == null || enabling == BiometricEnvelope.matches(data)) throw new IllegalStateException("Wrong mode");
            final Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            if (enabling) cipher.init(Cipher.ENCRYPT_MODE, generateKey(BIO_ALIAS, true));
            else cipher.init(Cipher.DECRYPT_MODE, (SecretKey) keyStore().getKey(BIO_ALIAS, null), new GCMParameterSpec(128, BiometricEnvelope.iv(data)));
            cipher.updateAAD(BiometricEnvelope.AAD);
            BiometricPrompt prompt = new BiometricPrompt.Builder(activity).setTitle(enabling ? "Enable biometric unlock" : "Verify to continue")
                .setSubtitle("Clean Things saved sign-in").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButton("Cancel", activity.getMainExecutor(), (dialog, which) -> finish(id, expected, failure("cancelled", "Verification cancelled. Your saved sign-in is unchanged."))).build();
            prompt.authenticate(new BiometricPrompt.CryptoObject(cipher), cancellation, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationError(int code, CharSequence message) {
                    finish(id, expected, failure("biometric", "Verification was not completed. Try again, or use password sign-in."));
                }
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    synchronized (SessionVault.this) {
                        if (!trustedDocument || expected != generation || cancellation == null) return;
                        try {
                            if (result.getCryptoObject() == null || result.getCryptoObject().getCipher() != cipher) throw new IllegalStateException("Missing crypto proof");
                            if (enabling) {
                                String value = plain(data);
                                KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256);
                                SecretKey fresh = generator.generateKey();
                                persist(BiometricEnvelope.create(cipher, fresh, value.getBytes(StandardCharsets.UTF_8)));
                                // Even a leftover legacy ciphertext can no longer be decrypted.
                                keyStore().deleteEntry(KEY_ALIAS); unlockedKey = fresh;
                            } else {
                                SecretKey restored = BiometricEnvelope.unwrap(cipher, data);
                                byte[] plaintext = BiometricEnvelope.decrypt(restored, data);
                                try {
                                    validate(new String(plaintext, StandardCharsets.UTF_8));
                                    if ("disable".equals(action)) {
                                        persist(SessionCipher.encrypt(key(true), plaintext));
                                        keyStore().deleteEntry(BIO_ALIAS); unlockedKey = null;
                                    } else unlockedKey = restored;
                                } finally { Arrays.fill(plaintext, (byte) 0); }
                            }
                            finish(id, expected, success(null));
                        } catch (Exception error) { unlockedKey = null; finish(id, expected, failure()); }
                    }
                }
            });
        } catch (Exception error) {
            finish(id, expected, failure("invalidated", "Biometric unlock could not be used. If your enrolled biometrics changed, use password sign-in and enable it again."));
        }
    }
}
