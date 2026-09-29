package gy.cleanthings.app;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** Executes the actual envelope implementation with a JVM AES provider; not an Android Keystore test. */
public final class SessionCipherTest {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void rejects(SecretKey key, byte[] value) throws Exception {
        try { SessionCipher.decrypt(key, value); throw new AssertionError("Unauthenticated data accepted"); }
        catch (GeneralSecurityException expected) { }
    }
    public static void main(String[] args) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256);
        SecretKey key = generator.generateKey();
        byte[] plain = "{\"access_token\":\"fixture-access\",\"refresh_token\":\"fixture-refresh\"}".getBytes(StandardCharsets.UTF_8);
        byte[] first = SessionCipher.encrypt(key, plain);
        require(Arrays.equals(SessionCipher.decrypt(key, first), plain), "Round trip failed");
        require(!new String(first, StandardCharsets.ISO_8859_1).contains("fixture-access"), "Plain token found in envelope");
        for (int n = 0; n < 32; n++) {
            byte[] next = SessionCipher.encrypt(key, plain);
            require(!Arrays.equals(first, next), "IV was reused");
            require(Arrays.equals(SessionCipher.decrypt(key, next), plain), "Repeated round trip failed");
        }
        for (int index : new int[]{0, 3, 4, 15, 16, first.length - 1}) {
            byte[] changed = first.clone(); changed[index] ^= 1; rejects(key, changed);
        }
        rejects(generator.generateKey(), first);
        rejects(key, Arrays.copyOf(first, first.length - 1));
        rejects(key, new byte[0]);
        rejects(key, new byte[70000]);
        System.out.println("AES-GCM round trips, random IVs, tampering, truncation, version and wrong-key rejection passed.");
    }
}
