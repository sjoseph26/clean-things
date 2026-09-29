const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('app/src/main/assets/backend.js','utf8');
const token=(name='old',expired=false)=>({access_token:name,refresh_token:name+'-refresh',expires_at:Math.floor(Date.now()/1000)+(expired?-10:3600),user:{id:name==='other'?'user-2':'user-1'}});
function harness(initial,handler){
 const data=new Map([['cleanthings.supabase.session.v1',JSON.stringify(initial)]]);const calls=[];let ended=0;
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const window={CLEAN_THINGS_CONFIG:{supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'public-fixture-for-tests-only'},sessionStorage:storage,Event,dispatchEvent:()=>ended++};
 vm.runInNewContext(source,{window,localStorage:storage,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{
  calls.push({url,options});const result=await handler(url,options);return {ok:result.status<400,status:result.status,text:async()=>JSON.stringify(result.body||[])};
 }});
 return {api:window.CleanThingsBackend,calls,get ended(){return ended}};
}
const ok=body=>({status:200,body});const error=(status,code)=>({status,body:{code,message:code}});
test('SESSION-01 resource 401 renews and retries once without losing admin session',async()=>{
 let count=0;const h=harness(token(),async url=>url.includes('refresh_token')?ok(token('new')):++count===1?error(401,'PGRST301'):ok([]));
 await h.api.listProfiles();assert.equal(h.calls.length,3);assert.equal(h.api.session().access_token,'new');assert.equal(h.ended,0);assert.equal(h.calls[2].options.headers.Authorization,'Bearer new');
});
test('SESSION-02 repeated resource denial is surfaced without a retry loop or logout',async()=>{
 const h=harness(token(),async url=>url.includes('refresh_token')?ok(token('new')):error(401,'42501'));
 await assert.rejects(h.api.listProfiles(),e=>e.status===401);assert.equal(h.calls.length,3);assert.equal(h.ended,0);assert.ok(h.api.session());
});
test('SESSION-03 transient refresh errors preserve login; revoked tokens end it',async()=>{
 for(const [status,code,ends] of [[503,'unexpected_failure',false],[429,'over_request_rate_limit',false],[400,'conflict',false],[403,'request_timeout',false],[400,'refresh_token_not_found',true],[400,'refresh_token_already_used',true],[401,'session_expired',true]]){
  const h=harness(token('old',true),async()=>error(status,code));await assert.rejects(h.api.listProfiles());assert.equal(h.api.session()===null,ends,code);assert.equal(h.ended,ends?1:0);
 }
});
test('SESSION-04 concurrent requests share one refresh',async()=>{
 let release;const pending=new Promise(r=>release=r);let refreshes=0;
 const h=harness(token('old',true),async url=>{if(url.includes('refresh_token')){refreshes++;await pending;return ok(token('new'))}return ok([])});
 const a=h.api.listProfiles(),b=h.api.listServices();release();await Promise.all([a,b]);assert.equal(refreshes,1);assert.equal(h.api.session().access_token,'new');
});
test('SESSION-05 delayed 401 cannot clear or retry under a newer account',async()=>{
 let release;const pending=new Promise(r=>release=r);
 const h=harness(token(),async url=>url.includes('grant_type=password')?ok(token('other')):pending);
 const old=h.api.listProfiles();await new Promise(r=>setImmediate(r));await h.api.signIn('other@example.test','fixture');release(error(401,'PGRST301'));
 await assert.rejects(old);assert.equal(h.api.session().user.id,'user-2');assert.equal(h.calls.length,2);assert.equal(h.ended,0);
});
test('SESSION-06 signout is local and in-flight refresh cannot restore it',async()=>{
 let release;const pending=new Promise(r=>release=r);
 const h=harness(token('old',true),async url=>url.includes('refresh_token')?pending:ok({}));
 const old=h.api.listProfiles();await h.api.signOut();release(ok(token('new')));await assert.rejects(old);
 assert.equal(h.api.session(),null);assert.ok(h.calls.some(c=>c.url.endsWith('/logout?scope=local')));
});
test('NATIVE-01 every HTML asset is allowed by the native WebView security boundary',()=>{
 const java=fs.readFileSync('app/src/main/java/gy/cleanthings/app/MainActivity.java','utf8');
 const literal=java.match(/file\.matches\(("[^"\n]+")\)/)[1];const allowed=new RegExp('^'+JSON.parse(literal)+'$');
 const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
 const assets=[...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css|png))"/g)].map(x=>x[1]);
 assert.ok(assets.includes('pull-refresh.js'));
 for(const asset of assets)assert.ok(allowed.test(asset),asset+' must load inside Android');
 assert.equal(allowed.test('../config.js'),false);assert.equal(allowed.test('untrusted.js'),false);
 assert.match(java,/CleanThingsHandleBack/);
});
