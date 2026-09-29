const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const factor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session=(id='user-1',token='old')=>({access_token:token,refresh_token:token+'-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id}});
const ok=body=>({status:200,body});const fail=(status,code)=>({status,body:{code,message:code}});
function setup(handler){
 const data=new Map([['cleanthings.supabase.session.v1',JSON.stringify(session())]]),calls=[];
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const context={window:{CLEAN_THINGS_CONFIG:{supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'public-fixture-for-tests-only'},sessionStorage:storage},localStorage:storage,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});const r=await handler(url,options);return {ok:r.status<400,status:r.status,headers:{get:()=>r.retryAfter||null},text:async()=>JSON.stringify(r.body||{})}}};
 for(const file of ['session-store.js','backend.js'])vm.runInNewContext(fs.readFileSync('app/src/main/assets/'+file,'utf8'),context);
 return {api:context.window.CleanThingsBackend,calls,data};
}
test('MFA-API-01 code verification sends challenge ID, preserves leading zeroes and saves renewed tokens',async()=>{
 const h=setup(async url=>url.endsWith('/challenge')?ok({id:'challenge-1'}):ok({...session('user-1','verified'),expires_at:undefined,expires_in:3600}));
 await h.api.verifyMfa(factor,'000012');assert.equal(h.calls.length,2);assert.deepEqual(JSON.parse(h.calls[1].options.body),{challenge_id:'challenge-1',code:'000012'});assert.equal(h.api.session().access_token,'verified');assert.ok(h.api.session().expires_at>Date.now()/1000);assert.equal(h.data.has('cleanthings.supabase.session.v1'),false);
});
test('MFA-API-02 invalid codes and factor IDs make no network calls',async()=>{
 const h=setup(async()=>{throw Error('unexpected')});for(const code of ['12345','1234567','12x456'])await assert.rejects(h.api.verifyMfa(factor,code),/six-digit/);await assert.rejects(h.api.verifyMfa('../other','123456'),/Choose an authenticator/);assert.equal(h.calls.length,0);
});
test('MFA-API-03 incorrect code does not change the saved session',async()=>{
 const h=setup(async url=>url.endsWith('/challenge')?ok({id:'challenge-1'}):fail(422,'mfa_verification_failed'));
 await assert.rejects(h.api.verifyMfa(factor,'123456'),/latest code/);assert.equal(h.api.session().access_token,'old');
});
test('MFA-API-04 429 produces a separate local verification wait',async()=>{
 const h=setup(async()=>({...fail(429,'over_request_rate_limit'),retryAfter:'120'}));await assert.rejects(h.api.verifyMfa(factor,'123456'),e=>e.status===429);await assert.rejects(h.api.verifyMfa(factor,'123456'),/Wait/);assert.equal(h.calls.length,1);assert.equal(h.api.authRetrySeconds('login'),0);assert.ok(h.api.authRetrySeconds('mfa')>0);
});
test('MFA-API-05 logout while challenge is in flight prevents verification and session resurrection',async()=>{
 let release;const waiting=new Promise(r=>release=r);const h=setup(async url=>url.endsWith('/challenge')?waiting:ok({}));
 const pending=h.api.verifyMfa(factor,'123456');await new Promise(r=>setImmediate(r));await h.api.signOut();release(ok({id:'challenge-1'}));await assert.rejects(pending,/session changed/);assert.equal(h.api.session(),null);assert.ok(!h.calls.some(c=>c.url.endsWith('/verify')));
});
test('MFA-API-06 late verify response cannot overwrite a new account',async()=>{
 let release;const waiting=new Promise(r=>release=r);const h=setup(async url=>url.endsWith('/challenge')?ok({id:'challenge-1'}):url.endsWith('/verify')?waiting:ok(session('user-2','other')));
 const pending=h.api.verifyMfa(factor,'123456');await new Promise(r=>setImmediate(r));await h.api.signIn('other@example.test','fixture');release(ok(session('user-1','verified')));await assert.rejects(pending,/session changed/);assert.equal(h.api.session().user.id,'user-2');
});
test('MFA-API-07 pending verification serializes other requests and rejects duplicate submits',async()=>{
 let release;const waiting=new Promise(r=>release=r);const h=setup(async url=>url.endsWith('/challenge')?ok({id:'challenge-1'}):url.endsWith('/verify')?waiting:ok([]));
 const pending=h.api.verifyMfa(factor,'123456');await new Promise(r=>setImmediate(r));await assert.rejects(h.api.verifyMfa(factor,'123456'),/already in progress/);const other=h.api.listProfiles();assert.equal(h.calls.length,2);release(ok(session('user-1','verified')));await Promise.all([pending,other]);assert.equal(h.calls[2].options.headers.Authorization,'Bearer verified');
});
test('MFA-API-08 account with a verified factor must verify it before adding another',async()=>{
 const h=setup(async url=>url.includes('admin_mfa_status')?ok({enforced:true,required:true,verified:false}):ok({id:'user-1',factors:[{id:factor,status:'verified',factor_type:'totp'}]}));await assert.rejects(h.api.enrollMfa(),/existing authenticator/);assert.equal(h.calls.length,2);
});
test('MFA-API-09 enrollment result is never persisted; cancellation only deletes an unverified factor',async()=>{
 let verified=false;const h=setup(async(url,options)=>{
  if(url.includes('admin_mfa_status'))return ok({enforced:true,required:true,verified:false});
  if(url.endsWith('/user'))return ok({id:'user-1',factors:[{id:factor,status:verified?'verified':'unverified',factor_type:'totp'}]});
  return ok({id:factor,totp:{secret:'FIXTURE-SECRET',qr_code:'<svg></svg>'}});
 });
 const result=await h.api.enrollMfa();assert.equal(result.totp.secret,'FIXTURE-SECRET');assert.ok(!JSON.stringify(h.api.session()).includes('FIXTURE-SECRET'));await h.api.cancelMfaEnrollment(factor);assert.ok(h.calls.some(c=>c.options.method==='DELETE'));
 verified=true;const before=h.calls.filter(c=>c.options.method==='DELETE').length;await assert.rejects(h.api.cancelMfaEnrollment(factor),/already active/);assert.equal(h.calls.filter(c=>c.options.method==='DELETE').length,before);
});
test('MFA-API-10 missing server enforcement is reported instead of granting access',async()=>{
 const h=setup(async()=>fail(404,'PGRST202'));await assert.rejects(h.api.adminMfaStatus(),/awaiting server activation/);
 const malformed=setup(async()=>ok({enforced:false,required:true,verified:true}));await assert.rejects(malformed.api.adminMfaStatus(),/could not be checked/);
});
