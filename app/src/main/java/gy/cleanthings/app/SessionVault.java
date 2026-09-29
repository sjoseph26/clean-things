package gy.cleanthings.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONObject;

/** Narrow bridge for the bundled, frame-free application document only. Never logs tokens. */
public final class SessionVault {
    private static final String KEY_ALIAS = "CleanThings.session.v1";
    private final AtomicFile file;
    private volatile boolean trustedDocument;

    SessionVault(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "session-v1.enc"));
    }

    void setTrustedDocument(boolean trusted) { trustedDocument = trusted; }

    private KeyStore keyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return store;
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = keyStore();
        SecretKey existing = (SecretKey) store.getKey(KEY_ALIAS, null);
        if (existing != null || !create) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private String failure() { return "{\"ok\":false,\"error\":\"Secure sign-in storage is unavailable. Restart the app and try again.\"}"; }
    private String success(String value) {
        return "{\"ok\":true,\"value\":" + (value == null ? "null" : JSONObject.quote(value)) + "}";
    }

    @JavascriptInterface
    public synchronized String read() {
        if (!trustedDocument) return failure();
        try {
            if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return success(null);
            if (file.getBaseFile().length() > 65632) return failure();
            if (BiometricEnvelope.matches(file.readFully())) return "{\"ok\":false,\"code\":\"legacy_lock\",\"error\":\"The old app-lock feature was removed. Sign in once with your password to save a biometric login.\"}";
            SecretKey key = key(false);
            if (key == null) return failure(); // Never replace the key and pretend old data decrypted.
            String value = new String(SessionCipher.decrypt(key, file.readFully()), StandardCharsets.UTF_8);
            validate(value);
            return success(value);
        } catch (Exception error) { return failure(); }
    }

    private void validate(String value) throws Exception {
        if (value == null || value.length() > 65536) throw new IllegalArgumentException("Invalid session");
        JSONObject session = new JSONObject(value);
        if (session.getString("access_token").isEmpty() || session.getString("refresh_token").isEmpty()
                || session.getJSONObject("user").getString("id").isEmpty()) throw new IllegalArgumentException("Invalid session");
    }

    @JavascriptInterface
    public synchronized String write(String value) {
        if (!trustedDocument) return failure();
        FileOutputStream output = null;
        try {
            validate(value);
            byte[] encrypted = SessionCipher.encrypt(key(true), value.getBytes(StandardCharsets.UTF_8));
            output = file.startWrite();
            output.write(encrypted);
            file.finishWrite(output);
            output = null;
            if (!Arrays.equals(encrypted, file.readFully())) return failure();
            // Fresh provider sign-in replaces an obsolete biometric-session envelope.
            try { keyStore().deleteEntry("CleanThings.biometric.v1"); } catch (Exception ignored) { }
            return success(null);
        } catch (Exception error) {
            if (output != null) file.failWrite(output);
            return failure();
        }
    }

    synchronized String currentUserId() throws Exception {
        JSONObject response = new JSONObject(read());
        if (!response.getBoolean("ok") || response.isNull("value")) return "";
        return new JSONObject(response.getString("value")).getJSONObject("user").getString("id");
    }

    @JavascriptInterface
    public synchronized String clear() {
        if (!trustedDocument) return failure();
        // Remove both ciphertext and its key. Deleting the key also invalidates a stale file copy.
        boolean keyRemoved = false;
        try { keyStore().deleteEntry(KEY_ALIAS); keyStore().deleteEntry("CleanThings.biometric.v1"); keyRemoved = true; }
        catch (Exception error) { /* Still attempt file removal. */ }
        file.delete();
        return keyRemoved && !file.getBaseFile().exists() ? success(null) : failure();
    }
}
