package gy.cleanthings.app;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Versioned authenticated envelope. Key creation/storage belongs to Android Keystore. */
final class SessionCipher {
    private static final byte[] MAGIC = {67, 84, 83, 1};
    private static final byte[] AAD = "CleanThings.session.v1".getBytes(StandardCharsets.UTF_8);
    private static final int IV_BYTES = 12;
    private static final int MAX_PLAINTEXT = 65536;

    static byte[] encrypt(SecretKey key, byte[] plaintext) throws GeneralSecurityException {
        if (plaintext.length == 0 || plaintext.length > MAX_PLAINTEXT) throw new GeneralSecurityException("Invalid session size");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        // Let the provider generate a fresh IV for every write, including token refresh.
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] iv = cipher.getIV();
        if (iv.length != IV_BYTES) throw new GeneralSecurityException("Unsupported IV size");
        cipher.updateAAD(AAD);
        byte[] encrypted = cipher.doFinal(plaintext);
        byte[] envelope = new byte[MAGIC.length + IV_BYTES + encrypted.length];
        System.arraycopy(MAGIC, 0, envelope, 0, MAGIC.length);
        System.arraycopy(iv, 0, envelope, MAGIC.length, IV_BYTES);
        System.arraycopy(encrypted, 0, envelope, MAGIC.length + IV_BYTES, encrypted.length);
        return envelope;
    }

    static byte[] decrypt(SecretKey key, byte[] envelope) throws GeneralSecurityException {
        if (envelope.length < MAGIC.length + IV_BYTES + 17 || envelope.length > MAX_PLAINTEXT + 32
                || !Arrays.equals(MAGIC, Arrays.copyOf(envelope, MAGIC.length))) {
            throw new GeneralSecurityException("Invalid session envelope");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, envelope, MAGIC.length, IV_BYTES));
        cipher.updateAAD(AAD);
        return cipher.doFinal(envelope, MAGIC.length + IV_BYTES, envelope.length - MAGIC.length - IV_BYTES);
    }
}
