package gy.cleanthings.app;

import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/** Authenticated session encrypted by a random key, wrapped by an auth-per-use Keystore key. */
final class BiometricEnvelope {
    private static final byte[] MAGIC = {67, 84, 66, 1};
    static final byte[] AAD = "CleanThings.biometric.v1".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    private static final int HEADER = 64; // magic + 12-byte IV + 32-byte key + 16-byte GCM tag

    static boolean matches(byte[] data) {
        return data.length >= 4 && Arrays.equals(MAGIC, Arrays.copyOf(data, 4));
    }
    private static void validate(byte[] data) throws GeneralSecurityException {
        if (!matches(data) || data.length < HEADER + 33 || data.length > HEADER + 65568)
            throw new GeneralSecurityException("Invalid biometric envelope");
    }
    static byte[] iv(byte[] data) throws GeneralSecurityException {
        validate(data); return Arrays.copyOfRange(data, 4, 16);
    }
    static SecretKey unwrap(Cipher cipher, byte[] data) throws GeneralSecurityException {
        validate(data);
        byte[] raw = cipher.doFinal(data, 16, 48);
        try {
            if (raw.length != 32) throw new GeneralSecurityException("Invalid key");
            return new SecretKeySpec(raw, "AES");
        } finally { Arrays.fill(raw, (byte) 0); }
    }
    static byte[] create(Cipher cipher, SecretKey key, byte[] plaintext) throws GeneralSecurityException {
        byte[] raw = key.getEncoded();
        byte[] wrapped;
        try { wrapped = cipher.doFinal(raw); } finally { Arrays.fill(raw, (byte) 0); }
        if (cipher.getIV().length != 12 || wrapped.length != 48) throw new GeneralSecurityException("Invalid wrapping cipher");
        byte[] header = new byte[HEADER];
        System.arraycopy(MAGIC, 0, header, 0, 4);
        System.arraycopy(cipher.getIV(), 0, header, 4, 12);
        System.arraycopy(wrapped, 0, header, 16, 48);
        return combine(header, SessionCipher.encrypt(key, plaintext));
    }
    static byte[] replace(SecretKey key, byte[] data, byte[] plaintext) throws GeneralSecurityException {
        validate(data); return combine(data, SessionCipher.encrypt(key, plaintext));
    }
    private static byte[] combine(byte[] header, byte[] ciphertext) {
        byte[] data = Arrays.copyOf(header, HEADER + ciphertext.length);
        System.arraycopy(ciphertext, 0, data, HEADER, ciphertext.length); return data;
    }
    static byte[] decrypt(SecretKey key, byte[] data) throws GeneralSecurityException {
        validate(data); return SessionCipher.decrypt(key, Arrays.copyOfRange(data, HEADER, data.length));
    }
}
