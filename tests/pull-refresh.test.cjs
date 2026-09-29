const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM('<div id="surface"><p id="content">Content</p><input id="input"><div id="nested" style="overflow-y:auto">Scroll list</div></div><div id="indicator" hidden></div><div id="status"></div>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;let calls=0,enabled=true,handler=async()=>true;
 w.eval(fs.readFileSync('app/src/main/assets/pull-refresh.js','utf8'));
 const control=w.CleanThingsPullRefresh({surface:d.getElementById('surface'),indicator:d.getElementById('indicator'),status:d.getElementById('status'),enabled:()=>enabled,refresh:()=>{calls++;return handler();}});
 function event(type,x=0,y=0,id='content',count=1){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'||type==='touchcancel'?[]:Array.from({length:count},()=>({clientX:x,clientY:y}))});d.getElementById(id).dispatchEvent(e);return e;}
 return {w,d,event,control,get calls(){return calls},set enabled(v){enabled=v},set handler(v){handler=v},close:()=>w.close()};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
function swipe(t,{x=0,y=150,id='content',end='touchend'}={}){t.event('touchstart',0,0,id);t.event('touchmove',x,y,id);t.event(end,0,0,id);}
test('PTR-01 intentional pull refreshes only on release and hides the indicator afterward',async()=>{const t=setup();try{t.event('touchstart');const move=t.event('touchmove',0,150);assert.equal(move.defaultPrevented,true);assert.equal(t.calls,0);assert.equal(t.d.getElementById('indicator').hidden,false);assert.match(t.d.getElementById('status').textContent,/Release/);t.event('touchend');assert.equal(t.calls,1);await tick();assert.equal(t.d.getElementById('indicator').hidden,true);assert.equal(t.d.getElementById('status').textContent,'Up to date.');}finally{t.close()}});
test('PTR-02 short, horizontal, upward, cancelled and multi-touch gestures do not refresh',()=>{const t=setup();try{for(const args of [{y:50},{x:180,y:150},{y:-150},{end:'touchcancel'}])swipe(t,args);t.event('touchstart',0,0);t.event('touchmove',0,150,'content',2);t.event('touchend');assert.equal(t.calls,0);}finally{t.close()}});
test('PTR-03 scrolled pages, form controls, nested scrolling and disabled views are protected',()=>{const t=setup();try{t.w.scrollY=20;swipe(t);t.w.scrollY=0;swipe(t,{id:'input'});const nested=t.d.getElementById('nested');Object.defineProperty(nested,'scrollHeight',{value:300});Object.defineProperty(nested,'clientHeight',{value:100});swipe(t,{id:'nested'});t.enabled=false;swipe(t);assert.equal(t.calls,0);}finally{t.close()}});
test('PTR-04 slow requests cannot be duplicated and the accessible action uses the same guard',async()=>{const t=setup();try{let resolve;t.handler=()=>new Promise(r=>resolve=r);swipe(t);swipe(t);t.control.refresh();assert.equal(t.calls,1);assert.equal(t.d.getElementById('indicator').hidden,false);resolve(true);await tick();assert.equal(t.d.getElementById('indicator').hidden,true);}finally{t.close()}});
test('PTR-05 failed requests clear the indicator and allow retry without a page reload',async()=>{const t=setup();try{t.handler=async()=>false;swipe(t);await tick();assert.match(t.d.getElementById('status').textContent,/could not/);assert.equal(t.d.getElementById('indicator').hidden,true);t.handler=async()=>true;await t.control.refresh();assert.equal(t.calls,2);assert.equal(t.d.getElementById('status').textContent,'Up to date.');}finally{t.close()}});
test('PTR-06 navigation during a gesture cancels it',()=>{const t=setup();try{t.event('touchstart');t.event('touchmove',0,150);t.enabled=false;t.event('touchend');assert.equal(t.calls,0);assert.equal(t.d.getElementById('indicator').hidden,true);}finally{t.close()}});
