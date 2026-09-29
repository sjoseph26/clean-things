package gy.cleanthings.app;

import java.security.*;
import java.security.spec.AlgorithmParameterSpec;
import java.util.Arrays;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Models Keystore's cached pre-auth AAD error while exercising the real envelope with AES-GCM. */
public final class BiometricAuthOrderTest {
    private static final class AuthCipher extends Cipher {
        final AuthSpi operation;
        AuthCipher(AuthSpi operation) { super(operation, new Provider("AuthOrderFixture", 1.0, "Test only") {}, "AES/GCM/NoPadding"); this.operation = operation; }
        void authorise() { operation.authorised = true; }
    }
    private static final class AuthSpi extends CipherSpi {
        final Cipher delegate;
        boolean authorised, poisoned;
        AuthSpi() throws Exception { delegate = Cipher.getInstance("AES/GCM/NoPadding"); }
        protected void engineSetMode(String mode) {}
        protected void engineSetPadding(String padding) {}
        protected int engineGetBlockSize() { return 16; }
        protected int engineGetOutputSize(int inputLen) { return delegate.getOutputSize(inputLen); }
        protected byte[] engineGetIV() { return delegate.getIV(); }
        protected AlgorithmParameters engineGetParameters() { return delegate.getParameters(); }
        protected void engineInit(int mode, Key key, SecureRandom random) throws InvalidKeyException { delegate.init(mode,key,random); }
        protected void engineInit(int mode, Key key, AlgorithmParameterSpec params, SecureRandom random) throws InvalidKeyException, InvalidAlgorithmParameterException { delegate.init(mode,key,params,random); }
        protected void engineInit(int mode, Key key, AlgorithmParameters params, SecureRandom random) throws InvalidKeyException, InvalidAlgorithmParameterException { delegate.init(mode,key,params,random); }
        protected void engineUpdateAAD(byte[] input, int offset, int count) {
            if (!authorised) { poisoned = true; return; } // Like Keystore, retain failure until finalization.
            if (!poisoned) delegate.updateAAD(input,offset,count);
        }
        protected byte[] engineUpdate(byte[] input,int offset,int count) { throw new AssertionError("Unexpected update"); }
        protected int engineUpdate(byte[] input,int offset,int count,byte[] output,int position) { throw new AssertionError("Unexpected update"); }
        protected byte[] engineDoFinal(byte[] input,int offset,int count) throws IllegalBlockSizeException,BadPaddingException {
            if (!authorised || poisoned) throw new IllegalBlockSizeException("Fixture: key used before biometric approval");
            return delegate.doFinal(input,offset,count);
        }
        protected int engineDoFinal(byte[] input,int offset,int count,byte[] output,int position) throws IllegalBlockSizeException,BadPaddingException,ShortBufferException {
            byte[] value=engineDoFinal(input,offset,count);
            if(output.length-position<value.length)throw new ShortBufferException();
            System.arraycopy(value,0,output,position,value.length);return value.length;
        }
    }
    private static AuthCipher operation(SecretKey key, byte[] data) throws Exception {
        AuthCipher cipher=new AuthCipher(new AuthSpi());
        if(data==null)cipher.init(Cipher.ENCRYPT_MODE,key);
        else cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,BiometricEnvelope.iv(data)));
        return cipher;
    }
    public static void main(String[] args) throws Exception {
        KeyGenerator g=KeyGenerator.getInstance("AES");g.init(256);SecretKey wrappingKey=g.generateKey(),dataKey=g.generateKey();
        byte[] session="fixture-session".getBytes("UTF-8");
        AuthCipher legacy=operation(wrappingKey,null);
        legacy.updateAAD(BiometricEnvelope.AAD); // v0.6.5 did this before the prompt.
        legacy.authorise();
        try {BiometricEnvelope.create(legacy,dataKey,session);throw new AssertionError("Pre-auth AAD failure was hidden");}
        catch(IllegalBlockSizeException expected) {}
        AuthCipher denied=operation(wrappingKey,null);
        try {BiometricEnvelope.create(denied,dataKey,session);throw new AssertionError("Unauthenticated key accepted");}
        catch(IllegalBlockSizeException expected) {}
        AuthCipher correct=operation(wrappingKey,null);correct.authorise();
        byte[] envelope=BiometricEnvelope.create(correct,dataKey,session);
        AuthCipher unlocking=operation(wrappingKey,envelope);unlocking.authorise();
        SecretKey restored=BiometricEnvelope.unwrap(unlocking,envelope);
        if(!Arrays.equals(session,BiometricEnvelope.decrypt(restored,envelope)))throw new AssertionError("Authenticated unlock failed");
        System.out.println("Pre-auth AAD regression reproduced; post-auth wrap/unwrap and unauthenticated denial passed.");
    }
}
