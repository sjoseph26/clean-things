const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const source=fs.readFileSync('app/src/main/assets/session-store.js','utf8');
const backend=fs.readFileSync('app/src/main/assets/backend.js','utf8');
const KEY='cleanthings.supabase.session.v1';
const fixture=name=>({access_token:name+'-access',refresh_token:name+'-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:name}});
function create(options={}){
 const log=[];const data=options.data||new Map();let value=options.saved||null;let fail=options.fail||'';
 if(options.legacy!==undefined)data.set(KEY,typeof options.legacy==='string'?options.legacy:JSON.stringify(options.legacy));
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>{log.push('plaintext-write');data.set(k,v)},removeItem:k=>{log.push('remove-legacy');data.delete(k)}};
 const bridge={};for(const method of ['read','write','clear'])bridge[method]=input=>{
  log.push(method);if(fail===method)return JSON.stringify({ok:false});
  if(method==='write')value=input;if(method==='clear')value=null;
  return JSON.stringify({ok:true,value:method==='read'?value:null});
 };
 const window={location:{origin:options.browser?'https://preview.example.test':'https://appassets.androidplatform.net'},CleanThingsNativeSession:options.missing?undefined:bridge};
 const context={window,localStorage:storage,AbortController,setTimeout,clearTimeout};vm.runInNewContext(source,context);
 return {store:window.CleanThingsSessionStore,log,data,context,get saved(){return value},setFail:v=>fail=v};
}
test('STORE-01 upgrade writes native storage before removing old plaintext and restores after reload',()=>{
 const h=create({legacy:fixture('old')});assert.equal(h.store.read().user.id,'old');
 assert.deepEqual(h.log,['read','write','remove-legacy']);assert.equal(h.data.has(KEY),false);assert.equal(h.store.status().encrypted,true);
 const reloaded=create({saved:h.saved,data:h.data});assert.equal(reloaded.store.read().refresh_token,'old-refresh');
});
test('STORE-02 encrypted session takes priority over a leftover legacy account',()=>{
 const h=create({saved:JSON.stringify(fixture('current')),legacy:fixture('old')});assert.equal(h.store.read().user.id,'current');assert.equal(h.data.has(KEY),false);assert.ok(!h.log.includes('write'));
});
test('STORE-03 migration failure is visible, preserves the pending legacy copy and never authenticates from it',()=>{
 const h=create({legacy:fixture('old'),fail:'write'});assert.equal(h.store.read(),null);assert.equal(h.data.has(KEY),true);assert.equal(h.store.status().encrypted,false);assert.match(h.store.status().warning,/could not be secured/);assert.ok(!h.log.includes('plaintext-write'));
 h.setFail('');h.store.write(fixture('new'));assert.equal(h.data.has(KEY),false);assert.equal(h.store.read().user.id,'new');assert.equal(h.store.status().warning,'');
});
test('STORE-04 missing bridge or unreadable ciphertext cannot fall back to plaintext on Android',()=>{
 for(const options of [{missing:true},{fail:'read'},{saved:'not-json'}]){
  const h=create({...options,legacy:fixture('old')});assert.equal(h.store.read(),null);assert.equal(h.store.status().persistent,false);assert.ok(h.store.status().warning);
 }
});
test('STORE-05 failed write clears runtime identity and attempts to remove the previous saved account',()=>{
 const h=create({saved:JSON.stringify(fixture('old'))});h.store.read();h.setFail('write');assert.throws(()=>h.store.write(fixture('new')),/could not be saved securely/);assert.equal(h.store.read(),null);assert.equal(h.saved,null);assert.ok(!h.log.includes('plaintext-write'));
});
test('STORE-06 logout clears native and legacy storage; failure remains visible with runtime identity cleared',()=>{
 const h=create({saved:JSON.stringify(fixture('old')),legacy:fixture('old')});h.store.clear();assert.equal(h.saved,null);assert.equal(h.data.has(KEY),false);assert.equal(h.store.read(),null);
 const broken=create({saved:JSON.stringify(fixture('old')),fail:'clear'});broken.store.read();assert.throws(()=>broken.store.clear(),/could not be fully removed/);assert.equal(broken.store.read(),null);assert.ok(broken.store.status().warning);
});
test('STORE-07 browser preview keeps tokens only in memory and never calls a spoofed native bridge',()=>{
 const h=create({browser:true,legacy:fixture('old')});assert.equal(h.store.read().user.id,'old');h.store.write(fixture('new'));assert.equal(h.data.has(KEY),false);assert.deepEqual(h.log,['remove-legacy','remove-legacy']);
 assert.equal(h.store.status().encrypted,false);assert.equal(create({browser:true,data:h.data}).store.read(),null);
});
test('STORE-08 malformed legacy data is discarded without creating a saved session',()=>{
 for(const legacy of ['invalid-json','null','{}']){const h=create({legacy});assert.equal(h.store.read(),null);assert.equal(h.data.has(KEY),false);assert.ok(!h.log.includes('write'));}
});
test('STORE-09 login, token renewal and signout use the encrypted adapter end to end',async()=>{
 const h=create();const calls=[];const renewed=fixture('new');
 h.context.window.CLEAN_THINGS_CONFIG={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'public-fixture-for-tests-only'};
 let deny=true;h.context.fetch=async(url,options)=>{calls.push({url,options});let body=[],status=200;
  if(url.includes('grant_type=password'))body=fixture('old');
  else if(url.includes('grant_type=refresh_token'))body=renewed;
  else if(url.includes('/profiles')&&deny){deny=false;status=401;body={code:'PGRST301'}}
  return {ok:status<400,status,text:async()=>JSON.stringify(body)};
 };
 vm.runInNewContext(backend,h.context);const api=h.context.window.CleanThingsBackend;
 await api.signIn('fixture@example.test','fixture');assert.equal(JSON.parse(h.saved).access_token,'old-access');
 await api.listProfiles();assert.equal(JSON.parse(h.saved).access_token,'new-access');assert.equal(h.data.has(KEY),false);
 h.setFail('clear');await assert.rejects(api.signOut(),/could not be fully removed/);assert.equal(api.session(),null);assert.ok(calls.some(c=>c.url.endsWith('/logout?scope=local')));
});
test('STORE-10 actual Java encryption envelope rejects modified or wrong-key data',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'ct-cipher-'));
 try{
  const compile=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',out,'app/src/main/java/gy/cleanthings/app/SessionCipher.java','tests/java/SessionCipherTest.java'],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
  const run=spawnSync('java',['-cp',out,'gy.cleanthings.app.SessionCipherTest'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/passed/);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('STORE-11 native trust boundary excludes remote documents, child frames and backups',()=>{
 const activity=fs.readFileSync('app/src/main/java/gy/cleanthings/app/MainActivity.java','utf8');const vault=fs.readFileSync('app/src/main/java/gy/cleanthings/app/SessionVault.java','utf8');const html=fs.readFileSync('app/src/main/assets/index.html','utf8');const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');
 assert.match(activity,/request\.isForMainFrame\(\) && !isTrustedDocument\(uri\)/);assert.match(activity,/setTrustedDocument\(isTrustedDocument/);assert.match(activity,/removeJavascriptInterface/);
 assert.match(html,/frame-src 'none'/);assert.match(html,/worker-src 'none'/);assert.match(vault,/getNoBackupFilesDir/);assert.match(vault,/AndroidKeyStore/);assert.match(vault,/setRandomizedEncryptionRequired\(true\)/);assert.match(manifest,/android:allowBackup="false"/);
 assert.equal((vault.match(/@JavascriptInterface/g)||[]).length,6);assert.equal((vault.match(/if \(!trustedDocument\) return failure\(\);/g)||[]).length,6);
 assert.ok(html.indexOf('session-store.js')<html.indexOf('backend.js'));
});
