const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/src/main/assets/backend.js', 'utf8');
const storage = () => { const data = new Map(); return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}; };
function harness(replies, tabStorage=storage()) {
  let now=Date.now(); const calls=[];
  class Clock extends Date { static now(){return now;} }
  const config={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'public-fixture-for-tests-only',passwordResetUrl:'https://recovery.example.test/'};
  const context={window:{CLEAN_THINGS_CONFIG:config,sessionStorage:tabStorage},localStorage:storage(),Date:Clock,AbortController,setTimeout,clearTimeout,
    fetch:async(url,options)=>{calls.push({url,options});const r=replies.shift();assert.ok(r,'unexpected network request');return {ok:r.status<400,status:r.status,headers:{get:()=>r.retryAfter||null},text:async()=>JSON.stringify(r.body||{})};}};
  vm.runInNewContext(source,context);
  return {api:context.window.CleanThingsBackend,calls,config,tabStorage,advance:ms=>{now+=ms}};
}
test('AUTH-02 server 429 blocks retry locally, survives reload, then allows an explicit retry',async()=>{
  const h=harness([{status:429,retryAfter:'120'},{status:200,body:{user:{id:'fixture-user'}}}]);
  await assert.rejects(h.api.signIn('a@example.test','fixture'),e=>e.status===429&&e.retryAfterSeconds===120);
  await assert.rejects(h.api.signIn('b@example.test','fixture'),/Wait/);
  assert.equal(h.calls.length,1);
  const reloaded=harness([],h.tabStorage);
  await assert.rejects(reloaded.api.signIn('a@example.test','fixture'),/Wait/);
  assert.equal(reloaded.calls.length,0);
  h.advance(121000);await h.api.signIn('a@example.test','fixture');assert.equal(h.calls.length,2);
});
test('AUTH-03 Retry-After accepts an HTTP date and safely defaults if absent or invalid',async()=>{
  for(const retryAfter of [new Date(Date.now()+120000).toUTCString(),'invalid',undefined]){
    const h=harness([{status:429,retryAfter}]);
    await assert.rejects(h.api.signIn('a@example.test','fixture'),e=>e.status===429&&e.retryAfterSeconds>=60&&e.retryAfterSeconds<=120);
  }
});
test('AUTH-04 invalid logins return the same message without leaking server detail',async()=>{
  for(const message of ['unknown email','wrong password']){
    const h=harness([{status:400,body:{code:'invalid_credentials',msg:message}}]);
    await assert.rejects(h.api.signIn('a@example.test','fixture'),{message:'The email or password is incorrect.'});
  }
});
test('REC-02 reset requests use the configured HTTPS redirect and wait between successful requests',async()=>{
  const h=harness([{status:200},{status:200}]);
  await h.api.requestPasswordReset('a@example.test');
  assert.ok(h.calls[0].url.endsWith(encodeURIComponent(h.config.passwordResetUrl)));
  assert.deepEqual(JSON.parse(h.calls[0].options.body),{email:'a@example.test'});
  await assert.rejects(h.api.requestPasswordReset('a@example.test'),e=>e.status===429);
  assert.equal(h.calls.length,1);h.advance(61000);await h.api.requestPasswordReset('a@example.test');
  assert.equal(h.calls.length,2);
  assert.doesNotMatch(h.tabStorage.getItem('cleanthings.auth.retry.v1'),/example|fixture/);
});
test('REC-03 missing recovery configuration sends no network request',async()=>{
  const h=harness([]);h.config.passwordResetUrl='';
  await assert.rejects(h.api.requestPasswordReset('a@example.test'),/not been configured/);assert.equal(h.calls.length,0);
});
test('REC-04 recovery throttling is separate from login and SMTP errors are sanitised',async()=>{
  const h=harness([{status:429},{status:200,body:{user:{id:'fixture-user'}}}]);
  await assert.rejects(h.api.requestPasswordReset('a@example.test'),e=>e.status===429);
  await h.api.signIn('a@example.test','fixture');assert.equal(h.calls.length,2);
  const failed=harness([{status:500,body:{msg:'SMTP internal diagnostic'}}]);
  await assert.rejects(failed.api.requestPasswordReset('a@example.test'),{message:'The recovery email service is temporarily unavailable. Please try again later.'});
  assert.equal(failed.api.authRetrySeconds('recovery'),0);
});
