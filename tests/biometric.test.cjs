const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('app/src/main/assets/session-store.js','utf8');
const fixture={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1'}};
function setup(options={}){
 let enabled=options.enabled!==false,locked=enabled,saved=JSON.stringify(fixture),pending=null,clearCalls=0;
 const listeners=new Map(),data=new Map([['cleanthings.supabase.session.v1',JSON.stringify({...fixture,user:{id:'legacy'}})]]);
 const ok=value=>JSON.stringify({ok:true,value});const deny=code=>JSON.stringify({ok:false,code,error:code});
 const bridge={read:()=>locked?deny('locked'):ok(saved),write:value=>{if(locked)return deny('locked');if(pending)return deny('busy');saved=value;return ok(null)},clear:()=>{enabled=false;locked=false;saved=null;pending=null;clearCalls++;return ok(null)},biometricStatus:()=>ok({available:true,enabled,locked,reason:''}),biometric:(action,id)=>{pending={action,id};return ok(null)},cancelBiometric:()=>{locked=enabled;pending=null;return ok(null)}};
 const window={location:{origin:'https://appassets.androidplatform.net'},CleanThingsNativeSession:bridge,addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:(name,cb)=>{if(listeners.get(name)===cb)listeners.delete(name)}};
 const localStorage={getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};
 const context={window,localStorage,setTimeout,clearTimeout,AbortController};vm.createContext(context);vm.runInContext(source,context);
 function reply(result,id=pending?.id){listeners.get('cleanthings:biometric-result')?.({detail:{id,result}})}
 return {store:window.CleanThingsSessionStore,context,window,bridge,data,get pending(){return pending},get saved(){return saved},get clearCalls(){return clearCalls},reply,complete(){const action=pending.action;enabled=action!=='disable';locked=false;const id=pending.id;pending=null;reply({ok:true},id)},get listeners(){return listeners}};
}
test('BIO-01 locked native storage never restores leftover plaintext or exposes a saved token',()=>{
 const h=setup();assert.equal(h.store.read(),null);assert.equal(h.data.size,0);assert.equal(h.store.status().biometric.locked,true);
 assert.throws(()=>h.store.write(fixture),/locked/);assert.equal(h.clearCalls,0);assert.ok(h.saved);
});
test('BIO-02 only native crypto success restores the saved session; wrong callback IDs are ignored',async()=>{
 const h=setup();const pending=h.store.biometric('unlock');h.reply({ok:true},'wrong-id');assert.equal(h.store.read(),null);
 await assert.rejects(h.store.biometric('unlock'),/already open/);h.complete();await pending;assert.equal(h.store.read().user.id,'user-1');assert.equal(h.listeners.size,0);
});
test('BIO-03 a forged success notification cannot unlock the native ciphertext',async()=>{
 const h=setup();const pending=h.store.biometric('unlock');h.reply({ok:true});await assert.rejects(pending,/could not be unlocked/);assert.equal(h.store.read(),null);
});
test('BIO-04 cancellation preserves the encrypted session and allows a later retry',async()=>{
 const h=setup();const pending=h.store.biometric('unlock');h.reply({ok:false,error:'Cancelled'});await assert.rejects(pending,/Cancelled/);assert.ok(h.saved);assert.equal(h.clearCalls,0);
 const retry=h.store.biometric('unlock');h.complete();await retry;assert.ok(h.store.read());
});
test('BIO-05 password fallback removes both saved session and pending unlock; late success cannot restore it',async()=>{
 const h=setup();const pending=h.store.biometric('unlock');const id=h.pending.id;h.store.clear();await assert.rejects(pending,/cancelled/);h.reply({ok:true},id);
 assert.equal(h.store.read(),null);assert.equal(h.saved,null);assert.equal(h.store.status().biometric.enabled,false);assert.equal(h.listeners.size,0);
});
test('BIO-06 opt-in, encrypted token updates, manual lock, unlock and verified opt-out',async()=>{
 const h=setup({enabled:false});assert.ok(h.store.read());let pending=h.store.biometric('enable');
 assert.throws(()=>h.store.write(fixture),/busy/);assert.equal(h.clearCalls,0);h.complete();await pending;
 h.store.write({...fixture,access_token:'rotated'});assert.match(h.saved,/rotated/);h.store.lock();assert.equal(h.store.read(),null);
 pending=h.store.biometric('unlock');h.complete();await pending;assert.equal(h.store.read().access_token,'rotated');
 pending=h.store.biometric('disable');h.complete();await pending;assert.equal(h.store.status().biometric.enabled,false);assert.ok(h.store.read());
});
test('BIO-07 actual Java envelope authenticates wrapping, payload, key identity and refreshed data',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'ct-biometric-'));
 try {
  const compile=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',out,'app/src/main/java/gy/cleanthings/app/SessionCipher.java','app/src/main/java/gy/cleanthings/app/BiometricEnvelope.java','tests/java/BiometricEnvelopeTest.java','tests/java/BiometricAuthOrderTest.java'],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
  const run=spawnSync('java',['-cp',out,'gy.cleanthings.app.BiometricEnvelopeTest'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/passed/);
  const order=spawnSync('java',['-cp',out,'gy.cleanthings.app.BiometricAuthOrderTest'],{encoding:'utf8'});assert.equal(order.status,0,order.stderr);assert.match(order.stdout,/regression reproduced/);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('BIO-08 source contracts require auth-per-use strong biometrics and retire background sessions',()=>{
 const vault=fs.readFileSync('app/src/main/java/gy/cleanthings/app/SessionVault.java','utf8');const main=fs.readFileSync('app/src/main/java/gy/cleanthings/app/MainActivity.java','utf8');
 assert.match(vault,/setUserAuthenticationParameters\(0, KeyProperties.AUTH_BIOMETRIC_STRONG\)/);assert.match(vault,/setInvalidatedByBiometricEnrollment\(true\)/);
 assert.match(vault,/new BiometricPrompt.CryptoObject\(cipher\)/);assert.match(vault,/expected != generation/);assert.match(vault,/keyStore\(\).deleteEntry\(KEY_ALIAS\)/);
 assert.match(main,/SystemClock.elapsedRealtime\(\) - stoppedAt >= 60000/);assert.match(main,/FLAG_SECURE/);assert.match(main,/sessionVault.setTrustedDocument\(false\);[\s\S]*recreate\(\)/);
});
function withBackend(h,fetcher){
 h.window.CLEAN_THINGS_CONFIG={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'sb_publishable_fixture_only'};
 h.context.fetch=fetcher;vm.runInContext(fs.readFileSync('app/src/main/assets/backend.js','utf8'),h.context);return h.window.CleanThingsBackend;
}
const response=payload=>({ok:true,status:200,text:async()=>JSON.stringify(payload)});
const tick=()=>new Promise(r=>setImmediate(r));
test('BIO-09 backend logout cancels unlock and cannot restore a cleared session',async()=>{
 const h=setup();const api=withBackend(h,async()=>response({}));const pending=api.biometricAction('unlock');await api.signOut();await assert.rejects(pending,/cancelled/);assert.equal(api.session(),null);
});
test('BIO-10 native enrolment waits for in-flight token rotation and protected requests wait for the prompt',async()=>{
 const h=setup({enabled:false});h.store.write({...fixture,expires_at:1});let finishRefresh,requests=0;
 const api=withBackend(h,async url=>{requests++;if(url.includes('grant_type=refresh_token'))return new Promise(r=>finishRefresh=()=>r(response({...fixture,access_token:'rotated'})));return response([])});
 const initial=api.listProfiles();await tick();const enabling=api.biometricAction('enable');assert.equal(h.pending,null);
 finishRefresh();await tick();assert.equal(h.pending.action,'enable');assert.match(h.saved,/rotated/);await initial;
 const before=requests;const blocked=api.listProfiles();await tick();assert.equal(requests,before);
 h.complete();await enabling;await blocked;assert.equal(requests,before+1);
});

test('BIO-11 prompt preparation never performs authenticated AAD; diagnostics contain only fixed stage codes',()=>{
 const vault=fs.readFileSync('app/src/main/java/gy/cleanthings/app/SessionVault.java','utf8');
 const start=vault.indexOf('private synchronized void startBiometric');const callback=vault.indexOf('@Override public void onAuthenticationSucceeded',start);
 const preparation=vault.slice(start,callback);
 assert.doesNotMatch(preparation,/\.updateAAD\s*\(|\.doFinal\s*\(/);
 assert.match(vault.slice(callback),/BiometricEnvelope.create\(cipher/);assert.match(vault.slice(callback),/BiometricEnvelope.unwrap\(cipher/);
 assert.match(vault,/BIO-.*stage/);assert.doesNotMatch(vault,/error\.getMessage\(|printStackTrace|Log\.[dew]/);
});
