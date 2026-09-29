package gy.cleanthings.app;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.UUID;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Optional saved account credentials. Separate from tokens, never consulted to lock the app. */
public final class SavedLoginVault {
    private static final String PREFIX = "CleanThings.saved-login.v1.";
    private final Activity activity;
    private final SessionVault sessions;
    private final Consumer<String> callback;
    private final AtomicFile file;
    private boolean trusted;
    private long generation;
    private CancellationSignal cancellation;
    private byte[] pendingPlaintext;
    private String pendingAlias;
    private String resultId;
    private byte[] resultPlaintext;

    SavedLoginVault(Activity activity, SessionVault sessions, Consumer<String> callback) {
        this.activity = activity; this.sessions = sessions; this.callback = callback;
        file = new AtomicFile(new File(activity.getNoBackupFilesDir(), "saved-login-v1.enc"));
    }
    synchronized void setTrustedDocument(boolean value) { if (!value) cancelInternal(); trusted = value; }
    private KeyStore store() throws Exception { KeyStore s=KeyStore.getInstance("AndroidKeyStore");s.load(null);return s; }
    private static String ok(String value) { return "{\"ok\":true,\"value\":"+(value==null?"null":JSONObject.quote(value))+"}"; }
    private static String fail(String message) { return "{\"ok\":false,\"error\":"+JSONObject.quote(message)+"}"; }
    private static void wipe(byte[] bytes) { if(bytes!=null)Arrays.fill(bytes,(byte)0); }
    private boolean exists() { return file.getBaseFile().exists() || new File(file.getBaseFile().getPath()+".bak").exists(); }
    private JSONObject record() throws Exception {
        if (!exists()) return null;
        if(file.getBaseFile().length()>24000)throw new IllegalStateException();
        JSONObject record=new JSONObject(new String(file.readFully(),StandardCharsets.UTF_8));
        if(!record.getString("alias").matches("CleanThings\\.saved-login\\.v1\\.[0-9a-f-]{36}"))throw new IllegalStateException();
        return record;
    }
    private void persist(JSONObject record) throws Exception {
        byte[] bytes=record.toString().getBytes(StandardCharsets.UTF_8);FileOutputStream out=null;
        try {out=file.startWrite();out.write(bytes);file.finishWrite(out);out=null;pendingAlias=null;if(!Arrays.equals(bytes,file.readFully()))throw new IllegalStateException();}
        finally {if(out!=null)file.failWrite(out);}
    }
    private void removeAlias(String alias) { if(alias!=null)try{store().deleteEntry(alias);}catch(Exception ignored){} }
    private void cancelInternal() {
        generation++;CancellationSignal c=cancellation;cancellation=null;
        wipe(pendingPlaintext);pendingPlaintext=null;wipe(resultPlaintext);resultPlaintext=null;resultId=null;
        removeAlias(pendingAlias);pendingAlias=null;
        if(c!=null)c.cancel();
    }
    private String unavailable() {
        if(Build.VERSION.SDK_INT<30)return "Biometric sign-in requires Android 11 or later. Use your password on this device.";
        BiometricManager manager=activity.getSystemService(BiometricManager.class);
        if(manager==null)return "Biometrics are unavailable on this device.";
        int status=manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if(status==BiometricManager.BIOMETRIC_SUCCESS)return "";
        if(status==BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED)return "Set up fingerprint or supported face recognition in Android Settings first.";
        return "Secure biometrics are temporarily unavailable or unsupported. You can use your password.";
    }
    @JavascriptInterface public synchronized String status() {
        if(!trusted)return fail("Saved login is unavailable.");
        String reason=unavailable();
        return "{\"ok\":true,\"value\":{\"available\":"+reason.isEmpty()+",\"enabled\":"+exists()+",\"reason\":"+JSONObject.quote(reason)+"}}";
    }
    private JSONObject validate(byte[] plaintext) throws Exception {
        if(plaintext==null||plaintext.length>16000)throw new IllegalArgumentException();
        JSONObject value=new JSONObject(new String(plaintext,StandardCharsets.UTF_8));
        if(!"saved-login-v1".equals(value.getString("kind"))||value.getString("email").isEmpty()||value.getString("email").length()>320
            ||value.getString("password").isEmpty()||value.getString("password").length()>4096||value.getString("userId").isEmpty())throw new IllegalArgumentException();
        return value;
    }
    @JavascriptInterface public synchronized String save(String value, String id) {
        if(!trusted)return fail("Saved login is unavailable.");
        byte[] plaintext=null;
        try {
            plaintext=value.getBytes(StandardCharsets.UTF_8);JSONObject login=validate(plaintext);
            if(!login.getString("userId").equals(sessions.currentUserId())){wipe(plaintext);return fail("Sign in successfully before saving this login.");}
            String response=begin(id,plaintext);plaintext=null;return response;
        }catch(Exception error){return fail("The login could not be saved. Sign in with your password and try again.");}
        finally{wipe(plaintext);}
    }
    @JavascriptInterface public synchronized String use(String id) {
        if(!trusted)return fail("Saved login is unavailable.");
        if(!exists())return fail("Sign in with your password and choose Save login first.");
        return begin(id,null);
    }
    private String begin(String id, byte[] plaintext) {
        if(id==null||!id.matches("[a-zA-Z0-9-]{1,80}")||cancellation!=null){wipe(plaintext);return fail("Another biometric request is already open.");}
        String reason=unavailable();if(!reason.isEmpty()){wipe(plaintext);return fail(reason);}
        cancelInternal();pendingPlaintext=plaintext;cancellation=new CancellationSignal();final long expected=++generation;
        activity.runOnUiThread(()->prompt(id,expected));return ok(null);
    }
    @JavascriptInterface public synchronized String cancel() {
        if(!trusted)return fail("Saved login is unavailable.");cancelInternal();return ok(null);
    }
    @JavascriptInterface public synchronized String forget() {
        if(!trusted)return fail("Saved login is unavailable.");cancelInternal();boolean removed=true;
        try {KeyStore keys=store();Enumeration<String> aliases=keys.aliases();while(aliases.hasMoreElements()){String alias=aliases.nextElement();if(alias.startsWith(PREFIX))keys.deleteEntry(alias);}}
        catch(Exception error){removed=false;}
        file.delete();return removed&&!exists()?ok(null):fail("The saved login could not be fully removed. Try again.");
    }
    @JavascriptInterface public synchronized String take(String id) {
        if(!trusted||id==null||!id.equals(resultId)||resultPlaintext==null)return fail("Biometric sign-in was not completed.");
        try {return ok(new String(resultPlaintext,StandardCharsets.UTF_8));}
        finally {wipe(resultPlaintext);resultPlaintext=null;resultId=null;}
    }
    private void finish(String id,long expected,String response) {
        if(!trusted||expected!=generation)return;
        cancellation=null;wipe(pendingPlaintext);pendingPlaintext=null;removeAlias(pendingAlias);pendingAlias=null;
        callback.accept("{\"id\":"+JSONObject.quote(id)+",\"result\":"+response+"}");
    }
    private synchronized void prompt(String id,long expected) {
        if(!trusted||expected!=generation||cancellation==null||Build.VERSION.SDK_INT<30)return;
        final boolean saving=pendingPlaintext!=null;
        try {
            final JSONObject previous=record();final byte[] envelope=previous==null?null:Base64.decode(previous.getString("envelope"),Base64.NO_WRAP);
            final Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            if(saving){
                pendingAlias=PREFIX+UUID.randomUUID();
                KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");
                g.init(new KeyGenParameterSpec.Builder(pendingAlias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true)
                    .setUserAuthenticationRequired(true).setUserAuthenticationParameters(0,KeyProperties.AUTH_BIOMETRIC_STRONG).setInvalidatedByBiometricEnrollment(true).build());
                cipher.init(Cipher.ENCRYPT_MODE,g.generateKey());
            }else{
                if(previous==null)throw new IllegalStateException();
                cipher.init(Cipher.DECRYPT_MODE,(SecretKey)store().getKey(previous.getString("alias"),null),new GCMParameterSpec(128,BiometricEnvelope.iv(envelope)));
            }
            // Do not send AAD or payload data to Keystore until the CryptoObject is authenticated.
            new BiometricPrompt.Builder(activity).setTitle(saving?"Save login for biometrics":"Sign in to Clean Things")
                .setSubtitle(saving?"Save this account on this device":"Use your saved login")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButton("Cancel",activity.getMainExecutor(),(dialog,which)->{
                    synchronized(SavedLoginVault.this){finish(id,expected,fail("Biometric sign-in cancelled."));}
                }).build().authenticate(new BiometricPrompt.CryptoObject(cipher),cancellation,activity.getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationError(int code,CharSequence message){synchronized(SavedLoginVault.this){finish(id,expected,fail("Verification was not completed. Try again or use your password."));}}
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){
                    synchronized(SavedLoginVault.this){
                        if(!trusted||expected!=generation||cancellation==null)return;
                        String stage="PROOF";
                        try {
                            if(result.getCryptoObject()==null||result.getCryptoObject().getCipher()!=cipher)throw new IllegalStateException();
                            if(saving){
                                stage="ACCOUNT";JSONObject login=validate(pendingPlaintext);
                                if(!login.getString("userId").equals(sessions.currentUserId()))throw new IllegalStateException();
                                stage="WRAP";KeyGenerator g=KeyGenerator.getInstance("AES");g.init(256);
                                byte[] encrypted=BiometricEnvelope.create(cipher,g.generateKey(),pendingPlaintext);
                                JSONObject next=new JSONObject().put("alias",pendingAlias).put("envelope",Base64.encodeToString(encrypted,Base64.NO_WRAP));
                                stage="SAVE";persist(next);pendingAlias=null; // New key now belongs to committed record.
                                if(previous!=null)removeAlias(previous.getString("alias"));
                            }else{
                                stage="READ";SecretKey key=BiometricEnvelope.unwrap(cipher,envelope);
                                byte[] plaintext=BiometricEnvelope.decrypt(key,envelope);
                                try{validate(plaintext);resultPlaintext=plaintext;resultId=id;plaintext=null;}
                                finally{wipe(plaintext);}
                            }
                            finish(id,expected,ok(null));
                        }catch(Exception error){wipe(resultPlaintext);resultPlaintext=null;resultId=null;finish(id,expected,fail("Saved login could not be used (BIO-"+stage+"). Use your password and save the login again."));}
                    }
                }
            });
        }catch(Exception error){finish(id,expected,fail("Saved login is unavailable. If your device biometrics changed, use your password and save the login again."));}
    }
}
