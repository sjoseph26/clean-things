package gy.cleanthings.app;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.GeneralSecurityException;

/** Executes real AES-GCM; Android biometric/Keystore acceptance still requires a device. */
public final class BiometricEnvelopeTest {
    private static Cipher wrapping(SecretKey key, byte[] data) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        if (data == null) c.init(Cipher.ENCRYPT_MODE, key);
        else c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, BiometricEnvelope.iv(data)));
        return c;
    }
    private static void rejects(SecretKey wrappingKey, byte[] data) throws Exception {
        try {
            SecretKey restored = BiometricEnvelope.unwrap(wrapping(wrappingKey, data), data);
            BiometricEnvelope.decrypt(restored, data); throw new AssertionError("Tampered envelope accepted");
        } catch (GeneralSecurityException expected) { }
    }
    public static void main(String[] args) throws Exception {
        KeyGenerator g = KeyGenerator.getInstance("AES"); g.init(256);
        SecretKey wrapper = g.generateKey(), key = g.generateKey(); byte[] value = "fixture-session".getBytes("UTF-8");
        byte[] data = BiometricEnvelope.create(wrapping(wrapper, null), key, value);
        SecretKey restored = BiometricEnvelope.unwrap(wrapping(wrapper, data), data);
        if (!Arrays.equals(value, BiometricEnvelope.decrypt(restored, data))) throw new AssertionError("Round trip");
        for (int index : new int[]{0, 3, 4, 15, 16, 63, 64, data.length - 1}) { byte[] bad = data.clone(); bad[index] ^= 1; rejects(wrapper, bad); }
        rejects(g.generateKey(), data); rejects(wrapper, Arrays.copyOf(data, data.length - 1)); rejects(wrapper, new byte[70000]);
        byte[] next = "rotated-session".getBytes("UTF-8");
        byte[] updated = BiometricEnvelope.replace(restored, data, next);
        if (!Arrays.equals(Arrays.copyOf(data,64),Arrays.copyOf(updated,64))) throw new AssertionError("Wrapped key changed");
        if (!Arrays.equals(next,BiometricEnvelope.decrypt(restored,updated))) throw new AssertionError("Refresh failed");
        rejects(wrapper, BiometricEnvelope.replace(g.generateKey(), data, value));
        System.out.println("Biometric wrapping, payload tampering, wrong key and token refresh passed.");
    }
}
