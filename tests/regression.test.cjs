const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const Core = require('../app/src/main/assets/core.js');
const root=path.join(__dirname,'../app/src/main/assets/');
const tick=()=>new Promise(r=>setTimeout(r,5));
const fixturePassword=['Example',String(100+23)].join('');
const service={id:'essential',name:'Essential Wash',icon:'🚙',price:3000,duration:'40 min',description:'Wash',includes:['Wash'],add_ons:[{id:'tyre-shine',name:'Tyre shine',price:800,description:'Shine'}],enabled:true};
async function setup(options={}) {
  const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://audit.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window; w.scrollTo=()=>{}; const calls=[];
  let active=options.guest?null:{user:{id:'user-1'}};
  const backend={enabled:()=>true,session:()=>active,
    sessionStorageStatus:()=>({biometric:options.biometric||{},message:"Saved sign-in is encrypted."}),
    listServices:async()=>{calls.push('services');return [service]},
    listPublicSettings:async()=>{calls.push('settings');return [{key:'business_name',value:'Test Business'}]},
    getMyProfile:async()=>{calls.push('profile');return active?{user_id:'user-1',name:'Fixture',phone:'5926000000',email:'a@example.test',role:options.admin?'admin':'customer'}:null},
    adminMfaStatus:async()=>({enforced:true,required:options.admin,verified:true}),
    listMfaFactors:async()=>[],
    listBookings:async()=>[],listReceipts:async()=>[],listProfiles:async()=>[],
    listAvailability:async()=>{calls.push('availability');return [{service_time:'10:00',status:'booked'}]},
    signOut:async()=>{active=null;},
    updateProfile:async()=>[],saveService:async()=>[],signedAvatarUrl:async()=>'',
  };
  w.CleanThingsBackend=backend;
  w.eval(fs.readFileSync(root+'core.js','utf8'));
  w.eval(fs.readFileSync(root+'pull-refresh.js','utf8'));
  const code=fs.readFileSync(root+'app.js','utf8');
  assert.ok(code.endsWith('})();\n'));
  w.eval(code.replace('  bootstrapBackend();\n})();',`window.audit={get state(){return state},get ui(){return ui},get services(){return services},render,navigate,bootstrapBackend,openLocationPicker,handleAdminAction,submitPayment,openEditCustomer,openServiceEditor,showServiceDetails,submitCustomerCreate,currentAccount,loadAvailability,activateAccount,logout,submitAdminSettings,openEditProfile,openEditBooking,submitCustomerLogin,refreshAuthControls,requireAdminMfa,submitMfa,handleMfaAction,handleBiometric};window.auditReady=bootstrapBackend();})();`));
  await w.auditReady;
  return {w,a:w.audit,backend,calls,close:()=>w.close(),setSession:v=>active=v};
}
const booking=(a)=>({reference:'CT-TEST',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accountId:'user-1',...a.ui.draft,serviceName:'Wash',total:3000,status:'Pending confirmation',payment:{status:'Not submitted',reference:'',proofName:'',proofPath:''}});

test('AUTH-05 login countdown survives render without disabling password recovery',async()=>{
 const t=await setup({guest:true});try{
  let remaining=0;
  t.backend.authRetrySeconds=action=>action==='login'?remaining:0;
  t.backend.signIn=async()=>{remaining=60;throw Error('Too many attempts. Wait 60 seconds, then try again.');};
  t.a.navigate('account');
  const form=t.w.document.getElementById('customer-login-form');
  form.querySelector('[name=email]').value='fixture@example.test';
  await t.a.submitCustomerLogin({preventDefault(){},currentTarget:form});
  assert.equal(form.querySelector('[type=submit]').disabled,true);
  assert.match(form.querySelector('[type=submit]').textContent,/60s/);
  assert.equal(form.querySelector('[data-action=forgot-password]').disabled,false);
  t.a.render();assert.equal(t.w.document.querySelector('#customer-login-form [type=submit]').disabled,true);
  remaining=0;t.a.refreshAuthControls();assert.equal(t.w.document.querySelector('#customer-login-form [type=submit]').disabled,false);
 }finally{t.close()}
});
test('REC-05 recovery success is generic and starts a separate resend countdown',async()=>{
 const t=await setup({guest:true});try{
  let remaining=0,calls=0;t.backend.authRetrySeconds=action=>action==='recovery'?remaining:0;
  t.backend.requestPasswordReset=async()=>{calls++;remaining=60;};t.a.navigate('account');
  t.w.document.getElementById('customer-email').value='fixture@example.test';
  const reset=t.w.document.querySelector('[data-action=forgot-password]');reset.click();await tick();
  assert.match(t.w.document.getElementById('customer-login-error').textContent,/If the account exists/);
  assert.equal(reset.disabled,true);assert.match(reset.textContent,/60s/);reset.click();assert.equal(calls,1);
  assert.equal(t.w.document.querySelector('#customer-login-form [type=submit]').disabled,false);
 }finally{t.close()}
});

test('F01 startup loads catalog/settings and restores a session without persisting PII',async()=>{const t=await setup();try{assert.ok(t.calls.includes('services'));assert.ok(t.calls.includes('settings'));assert.equal(t.a.ui.backendStatus,'online');assert.equal(t.a.currentAccount().id,'user-1');assert.equal(t.a.state.settings.businessName,'Test Business');assert.equal(JSON.parse(t.w.localStorage.getItem('cleanthings.prototype.v1')).accounts,undefined);}finally{t.close()}});
test('F02 map save preserves all typed booking details',async()=>{const t=await setup();try{t.a.navigate('booking',{serviceId:'essential'});t.a.ui.draft.serviceMode='mobile';t.a.ui.bookingStep=3;t.a.render();for(const [id,value] of [['name','Changed name'],['phone','5926999999'],['vehicle','Test vehicle'],['plate','TEST'],['notes','Keep this']])t.w.document.getElementById(id).value=value;t.w.document.querySelector('[name=waterConfirmed]').checked=true;t.a.openLocationPicker(false);t.w.document.querySelector('[data-map-save]').click();assert.equal(t.w.document.getElementById('vehicle').value,'Test vehicle');assert.equal(t.w.document.getElementById('notes').value,'Keep this');assert.equal(t.w.document.getElementById('name').value,'Changed name');assert.equal(t.w.document.querySelector('[name=waterConfirmed]').checked,true);}finally{t.close()}});
test('F03 invalid coordinates cannot close/save the map',async()=>{const t=await setup();try{t.a.openLocationPicker(false);t.w.document.getElementById('map-latitude').value='999';t.w.document.querySelector('[data-map-save]').click();assert.ok(t.w.document.querySelector('[data-map-save]'));assert.equal(t.a.ui.draft.locationPin,'');assert.match(t.w.document.querySelector('[data-map-status]').textContent,/-90/);}finally{t.close()}});
test('F04 zoom preserves pin while map taps move it',async()=>{const t=await setup();try{t.a.openLocationPicker(false);const map=t.w.document.getElementById('location-map');map.setPointerCapture=()=>{};map.getBoundingClientRect=()=>({left:0,top:0,width:520,height:280});const button=t.w.document.querySelector('[data-map-zoom]');for(const type of ['pointerdown','pointerup'])button.dispatchEvent(new t.w.MouseEvent(type,{bubbles:true,clientX:480,clientY:30}));button.click();assert.equal(t.w.document.getElementById('map-latitude').value,'6.801300');for(const type of ['pointerdown','pointerup'])map.dispatchEvent(new t.w.MouseEvent(type,{bubbles:true,clientX:400,clientY:80}));assert.notEqual(t.w.document.getElementById('map-latitude').value,'6.801300');}finally{t.close()}});
test('F05 failed admin update does not alter booking status',async()=>{const t=await setup();try{t.a.state.bookings=[booking(t.a)];t.backend.updateBooking=async()=>{throw Error('offline')};await t.a.handleAdminAction('complete','CT-TEST');assert.equal(t.a.state.bookings[0].status,'Pending confirmation');}finally{t.close()}});
test('F06 failed payment request does not change saved state',async()=>{const t=await setup();try{t.a.state.bookings=[booking(t.a)];t.a.navigate('payment',{reference:'CT-TEST'});t.w.document.getElementById('payment-reference').value='TEST-REF';t.backend.updateMyBooking=async()=>{throw Error('offline')};await t.a.submitPayment({preventDefault(){},currentTarget:t.w.document.getElementById('payment-form')});assert.equal(t.a.state.bookings[0].payment.status,'Not submitted');assert.match(t.w.document.getElementById('payment-error').textContent,/offline/);}finally{t.close()}});
test('F07 editable service fields remain text in details and catalog',async()=>{const t=await setup();try{const html='<img id="injected" src=x onerror="alert(1)">';for(const key of ['name','description','duration','icon'])t.a.services[0][key]=html;t.a.services[0].includes=[html];t.a.services[0].addOns[0].name=html;t.a.showServiceDetails('essential');assert.equal(t.w.document.getElementById('injected'),null);t.a.ui.screen='services';t.a.render();assert.equal(t.w.document.getElementById('injected'),null);assert.ok(t.w.document.body.textContent.includes(html));}finally{t.close()}});
test('F08 punctuation-only phone is rejected before signup',async()=>{assert.equal(Core.validPhone('-------'),false);assert.equal(Core.validPhone('+592 600 0000'),true);const t=await setup({guest:true});try{t.a.ui.screen='account';t.a.ui.accountMode='create';t.a.render();for(const [id,v] of [['new-name','Test User'],['new-phone','-------'],['new-email','test@example.test'],['new-password',fixturePassword],['confirm-password',fixturePassword]])t.w.document.getElementById(id).value=v;let calls=0;t.backend.signUp=async()=>{calls++};await t.a.submitCustomerCreate({preventDefault(){},currentTarget:t.w.document.getElementById('customer-create-form')});assert.equal(calls,0);assert.match(t.w.document.getElementById('customer-create-error').textContent,/telephone/);}finally{t.close()}});
test('F09 login email is read-only and ignored by profile editor',async()=>{const t=await setup();try{t.a.openEditCustomer('5926000000');const input=t.w.document.querySelector('[name=email]');assert.equal(input.readOnly,true);input.value='changed@example.test';t.w.document.getElementById('edit-customer-form').dispatchEvent(new t.w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(t.a.state.accounts[0].email,'a@example.test');}finally{t.close()}});
test('F10 add-on reorder and repricing preserve identities',()=>{const old=[{id:'tyre-shine',name:'Tyre shine',price:800},{id:'vacuum',name:'Vacuum',price:1000}];const next=Core.serviceAddOnsFromText('Vacuum | 1100 | Updated\nTyre shine | 900 | Updated',old);assert.deepEqual(next.map(x=>x.id),['vacuum','tyre-shine']);assert.throws(()=>Core.serviceAddOnsFromText('Bad | nope'),/prices/);});
test('F11 failed logout clears local identity and records',async()=>{const t=await setup();try{t.a.state.bookings=[booking(t.a)];t.backend.signOut=async()=>{t.setSession(null);throw Error('offline')};await t.a.logout();assert.equal(t.w.sessionStorage.getItem('cleanthings.customer.id'),null);assert.equal(t.a.currentAccount(),null);assert.equal(t.a.state.bookings.length,0);}finally{t.close()}});
test('F13 schedule loads occupied slots on initial entry and fails closed',async()=>{const t=await setup();try{t.a.navigate('booking',{serviceId:'essential'});t.w.document.querySelector('[data-action=booking-next]').click();await tick();assert.ok(t.calls.includes('availability'));assert.equal(t.w.document.querySelector('[data-time="10:00"]').disabled,true);t.backend.listAvailability=async()=>{throw Error('offline')};await assert.rejects(t.a.loadAvailability(t.a.ui.draft.date));t.a.render();assert.ok([...t.w.document.querySelectorAll('.slot')].every(x=>x.disabled));}finally{t.close()}});
test('F14 repeated Submit sends one request and preserves retry key',async()=>{const t=await setup();try{t.a.navigate('booking',{serviceId:'essential'});Object.assign(t.a.ui.draft,{serviceMode:'bay',time:'08:30',vehicle:'Car',plate:'TEST'});await t.a.loadAvailability(t.a.ui.draft.date);t.a.ui.bookingStep=4;t.a.render();t.w.document.getElementById('confirm-accuracy').checked=true;let resolve;const sent=[];t.backend.createBooking=d=>{sent.push(d);return new Promise(r=>resolve=r)};const button=t.w.document.querySelector('[data-action=confirm-booking]');button.click();button.click();assert.equal(sent.length,1);assert.ok(sent[0].requestId);resolve({booking:booking(t.a)});await tick();assert.equal(t.a.ui.screen,'success');assert.equal(t.a.state.bookings.length,1);}finally{t.close()}});
test('LOC-01 GPS success and denial retain manual fallback',async()=>{const t=await setup();try{Object.defineProperty(t.w.navigator,'geolocation',{value:{getCurrentPosition(ok,fail,opt){assert.equal(opt.timeout,15000);ok({coords:{latitude:6.82,longitude:-58.16}})}},configurable:true});t.a.openLocationPicker(true);assert.equal(t.w.document.getElementById('map-latitude').value,'6.820000');Object.defineProperty(t.w.navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1})}},configurable:true});t.a.openLocationPicker(true);assert.equal(t.w.document.querySelector('[data-map-current]').disabled,false);assert.match(t.w.document.querySelector('[data-map-status]').textContent,/unavailable/);}finally{t.close()}});
test('AUTH-01 forged UI admin flag does not reveal management',async()=>{const t=await setup();try{t.w.sessionStorage.setItem('cleanthings.admin.auth','true');t.a.ui.screen='admin';t.a.render();assert.match(t.w.document.getElementById('app-main').textContent,/Administrator account required/);}finally{t.close()}});
test('STATE-01 failed settings save leaves previous values',async()=>{const t=await setup();try{const form=t.w.document.createElement('form');form.innerHTML='<input name="businessName" value="Changed"><input name="mmgAccountName" value="Changed"><input name="mmgNumber" value="9999999">';t.backend.savePublicSettings=async()=>{throw Error('offline')};await t.a.submitAdminSettings({preventDefault(){},currentTarget:form});assert.equal(t.a.state.settings.businessName,'Test Business');}finally{t.close()}});
test('STATE-02 failed service/profile edits preserve saved records',async()=>{const t=await setup();try{const service=t.a.services[0];t.a.openServiceEditor(service);t.w.document.querySelector('[name=name]').value='New Service';t.backend.saveService=async()=>{throw Error('offline')};t.w.document.getElementById('service-form').dispatchEvent(new t.w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(service.name,'Essential Wash');t.a.openEditProfile();t.w.document.querySelector('[name=name]').value='New name';t.backend.updateProfile=async()=>{throw Error('offline')};t.w.document.getElementById('profile-form').dispatchEvent(new t.w.Event('submit',{cancelable:true,bubbles:true}));await tick();assert.equal(t.a.currentAccount().name,'Fixture');}finally{t.close()}});

test('PTR-07 app protects booking, sign-in and settings forms while allowing live browsing refresh',async()=>{
 const t=await setup({admin:true});try{
  t.a.state.accounts=[{id:'user-1',name:'Fixture Admin',phone:'5926000000',role:'admin'}];
  const swipe=()=>{const target=t.w.document.getElementById('app-main');for(const [type,y] of [['touchstart',0],['touchmove',160],['touchend',0]]){const event=new t.w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{clientX:100,clientY:y}]});target.dispatchEvent(event);}};
  for(const screen of ['booking','account','admin']){
    t.a.ui.screen=screen;t.a.ui.adminTab='settings';t.a.render();const before=t.calls.length;swipe();await tick();assert.equal(t.calls.length,before,screen+' must not refresh');
  }
  t.a.ui.screen='home';t.a.render();const before=t.calls.filter(x=>x==='services').length;swipe();await tick();assert.equal(t.calls.filter(x=>x==='services').length,before+1);assert.equal(t.w.document.querySelector('.refresh-button'),null);assert.equal(t.w.document.getElementById('accessible-refresh').hidden,false);
 }finally{t.close()}
});

test('ADMIN-01 incomplete or failed customer directory retains authenticated admin',async()=>{
 const t=await setup({admin:true});try{
  assert.equal(t.a.currentAccount().role,'admin');
  t.backend.listProfiles=async()=>{throw Error('temporary network failure')};
  await t.a.activateAccount(await t.backend.getMyProfile());
  assert.equal(t.a.currentAccount().role,'admin');
  t.a.ui.screen='admin';t.a.render();assert.match(t.w.document.getElementById('app-main').textContent,/Business overview/);
 }finally{t.close()}
});
test('ADMIN-02 structured add-ons keep numeric prices, literal descriptions and identities on rename',async()=>{
 const t=await setup({admin:true});try{
  const service=t.a.services[0];t.a.openServiceEditor(service);
  const form=t.w.document.getElementById('service-form');let saved;
  t.backend.saveService=async row=>{saved=row};
  form.querySelector('[data-addon-name]').value='Renamed shine';
  form.querySelector('[data-addon-description]').value='Price | stays separate\nSecond line';
  form.querySelector('[data-addon-price]').value='1250.50';
  t.w.document.getElementById('add-service-addon').click();
  const row=form.querySelectorAll('.service-addon-row')[1];
  row.querySelector('[data-addon-name]').value='Complimentary wipe';row.querySelector('[data-addon-price]').value='0';
  form.dispatchEvent(new t.w.Event('submit',{cancelable:true,bubbles:true}));await tick();
  assert.equal(saved.add_ons[0].id,'tyre-shine');assert.equal(saved.add_ons[0].price,1250.5);
  assert.equal(saved.add_ons[0].description,'Price | stays separate\nSecond line');assert.equal(saved.add_ons[1].price,0);
  assert.ok(saved.add_ons[1].id.startsWith('addon-'));
  t.a.openServiceEditor(service);t.w.document.querySelector('[data-remove-addon]').click();
  assert.equal(t.w.document.querySelectorAll('.service-addon-row').length,1);
 }finally{t.close()}
});
test('ADMIN-03 empty or negative add-on price cannot save; failed save preserves draft',async()=>{
 const t=await setup({admin:true});try{
  t.a.openServiceEditor(t.a.services[0]);const form=t.w.document.getElementById('service-form');let calls=0;
  t.backend.saveService=async()=>{calls++;throw Error('offline')};
  for(const value of ['', '-5']){form.querySelector('[data-addon-price]').value=value;form.dispatchEvent(new t.w.Event('submit',{cancelable:true,bubbles:true}));await tick();}
  assert.equal(calls,0);form.querySelector('[data-addon-price]').value='50';form.dispatchEvent(new t.w.Event('submit',{cancelable:true,bubbles:true}));await tick();
  assert.equal(calls,1);assert.equal(form.querySelector('[data-addon-price]').value,'50');assert.equal(t.a.services[0].addOns[0].price,800);assert.equal(form.querySelector('[type=submit]').disabled,false);
 }finally{t.close()}
});
test('ADMIN-04 month combines with search/status and includes Guyana walk-in month',async()=>{
 const t=await setup({admin:true});try{
  t.a.state.bookings=[{...booking(t.a),date:'2026-10-10',reference:'CT-OCT'}, {...booking(t.a),date:'2026-11-01',reference:'CT-NOV'}, {...booking(t.a),date:'',walkIn:true,createdAt:'2026-11-01T02:00:00Z',reference:'CT-WALK'}];
  t.a.ui.screen='admin';t.a.ui.adminTab='bookings';t.a.render();
  const month=t.w.document.getElementById('admin-booking-month');month.value='2026-10';month.dispatchEvent(new t.w.Event('change'));
  const text=()=>t.w.document.getElementById('app-main').textContent;
  assert.match(text(),/CT-OCT/);assert.match(text(),/CT-WALK/);assert.doesNotMatch(text(),/CT-NOV/);
  t.a.ui.adminSearch='CT-OCT';t.a.render();assert.doesNotMatch(text(),/CT-WALK/);
  t.a.ui.adminStatus='Completed';t.a.render();assert.match(text(),/No matching bookings/);
  t.a.ui.adminSearch='';t.a.ui.adminStatus='All';t.a.render();t.w.document.getElementById('clear-booking-month').click();assert.match(text(),/CT-NOV/);
 }finally{t.close()}
});
test('BACK-01 native and browser Back close pop-ups without replacing underlying unsaved form',async()=>{
 const t=await setup();try{
  t.a.navigate('booking',{serviceId:'essential'});t.a.ui.bookingStep=3;t.a.render();
  const notes=t.w.document.getElementById('notes');notes.value='Unsaved details';t.a.showServiceDetails('essential');
  assert.equal(t.w.CleanThingsHandleBack(),true);assert.equal(t.w.CleanThingsHandleBack(),false);assert.equal(notes.value,'Unsaved details');
  t.a.showServiceDetails('essential');t.w.dispatchEvent(new t.w.PopStateEvent('popstate',{state:{screen:'home'}}));
  assert.equal(t.a.ui.screen,'booking');assert.equal(t.w.document.getElementById('notes'),notes);assert.equal(t.w.document.querySelector('[role=dialog]'),null);
 }finally{t.close()}
});

test('MFA-UI-01 password-only admin sees challenge before any business data is loaded',async()=>{
 const t=await setup({guest:true,admin:true});try{
  t.setSession({user:{id:'user-1'}});let protectedReads=0;
  t.backend.adminMfaStatus=async()=>({enforced:true,required:true,verified:false});
  t.backend.listMfaFactors=async()=>[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',factor_type:'totp',status:'verified',friendly_name:'Primary'}];
  t.backend.listBookings=t.backend.listProfiles=t.backend.listReceipts=async()=>{protectedReads++;return []};
  const account=await t.a.activateAccount(await t.backend.getMyProfile());t.a.render();
  assert.equal(account,null);assert.equal(protectedReads,0);assert.equal(t.a.currentAccount(),null);assert.equal(t.a.ui.screen,'mfa');assert.ok(t.w.document.getElementById('mfa-code'));
  t.a.navigate('admin');assert.equal(t.a.ui.screen,'mfa');assert.doesNotMatch(t.w.document.getElementById('app-main').textContent,/Business overview/);
 }finally{t.close()}
});
test('MFA-UI-02 server rollout or factor lookup failure keeps admin locked',async()=>{
 const t=await setup({guest:true,admin:true});try{
  t.setSession({user:{id:'user-1'}});t.backend.adminMfaStatus=async()=>{throw Error('Awaiting server activation')};
  assert.equal(await t.a.activateAccount(await t.backend.getMyProfile()),null);t.a.render();assert.match(t.w.document.getElementById('mfa-error').textContent,/server activation/);assert.equal(t.a.currentAccount(),null);
 }finally{t.close()}
});
test('MFA-UI-03 enrolment secrets remain in memory and successful code is followed by server authorization',async()=>{
 const t=await setup({guest:true,admin:true});try{
  t.setSession({user:{id:'user-1'}});let verified=false,submissions=0;
  t.backend.adminMfaStatus=async()=>({enforced:true,required:true,verified});t.backend.listMfaFactors=async()=>[];
  t.backend.enrollMfa=async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',totp:{secret:'FIXTURE-SETUP-KEY',qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>'}});
  t.backend.verifyMfa=async(id,code)=>{submissions++;assert.equal(code,'123456');verified=true};
  await t.a.activateAccount(await t.backend.getMyProfile());t.a.render();
  t.w.document.querySelector('[data-action=mfa-start]').click();await tick();
  assert.match(t.w.document.querySelector('.mfa-secret').textContent,/FIXTURE/);
  for(let i=0;i<t.w.localStorage.length;i++)assert.doesNotMatch(t.w.localStorage.getItem(t.w.localStorage.key(i)),/FIXTURE-SETUP-KEY/);
  assert.equal(t.w.document.querySelector('#app-main svg'),null);
  const form=t.w.document.getElementById('mfa-form');form.querySelector('input').value='123456';form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(submissions,1);assert.equal(t.a.ui.mfa,null);assert.equal(t.w.document.querySelector('.mfa-secret'),null);assert.equal(t.a.ui.screen,'admin');assert.equal(t.a.currentAccount().role,'admin');
 }finally{t.close()}
});
test('MFA-UI-04 wrong code and logout during verification cannot expose admin records',async()=>{
 const t=await setup({guest:true,admin:true});try{
  t.setSession({user:{id:'user-1'}});t.backend.adminMfaStatus=async()=>({enforced:true,required:true,verified:false});t.backend.listMfaFactors=async()=>[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'verified'}];
  await t.a.activateAccount(await t.backend.getMyProfile());t.a.render();t.backend.verifyMfa=async()=>{throw Error('Wrong code')};
  let form=t.w.document.getElementById('mfa-form');form.querySelector('input').value='123456';await t.a.submitMfa({preventDefault(){},currentTarget:form});assert.match(t.w.document.getElementById('mfa-error').textContent,/Wrong code/);assert.equal(t.a.currentAccount(),null);
  let release;t.backend.verifyMfa=()=>new Promise(r=>release=r);form=t.w.document.getElementById('mfa-form');form.querySelector('input').value='123456';const pending=t.a.submitMfa({preventDefault(){},currentTarget:form});await t.a.logout();release();await pending;assert.equal(t.a.currentAccount(),null);assert.equal(t.a.ui.mfa,null);assert.equal(t.a.ui.screen,'account');
 }finally{t.close()}
});

test('MFA-UI-05 a verification response cannot unlock admin when server authorization still denies it',async()=>{
 const t=await setup({guest:true,admin:true});try{
  t.setSession({user:{id:'user-1'}});t.backend.adminMfaStatus=async()=>({enforced:true,required:true,verified:false});t.backend.listMfaFactors=async()=>[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'verified'}];
  await t.a.activateAccount(await t.backend.getMyProfile());t.a.render();t.backend.verifyMfa=async()=>true;
  const form=t.w.document.getElementById('mfa-form');form.querySelector('input').value='123456';await t.a.submitMfa({preventDefault(){},currentTarget:form});assert.equal(t.a.currentAccount(),null);assert.equal(t.a.ui.screen,'mfa');assert.doesNotMatch(t.w.document.getElementById('app-main').textContent,/Business overview/);
 }finally{t.close()}
});


test('BIO-UI-01 saved login never redirects active account into an app lock',async()=>{
 const t=await setup({biometric:{available:true,enabled:true}});try{assert.notEqual(t.a.ui.screen,'unlock');assert.ok(t.calls.includes('profile'));t.a.navigate('account');assert.equal(t.w.document.querySelector('[data-action=biometric-lock]'),null);assert.ok(t.w.document.querySelector('[data-action=biometric-forget]'));}finally{t.close()}
});
test('BIO-UI-02 cancellation leaves password form usable and duplicate taps open only one prompt',async()=>{
 const t=await setup({guest:true,biometric:{available:true,enabled:true}});try{t.a.navigate('account');let reject,count=0;t.backend.signInWithBiometrics=()=>{count++;return new Promise((_,r)=>reject=r)};const p=t.a.handleBiometric('signin');await t.a.handleBiometric('signin');assert.equal(count,1);reject(Error('Cancelled'));await p;assert.ok(t.w.document.querySelector('#customer-login-form'));assert.match(t.w.document.querySelector('#biometric-signin-help').textContent,/Cancelled/);}finally{t.close()}
});
test('BIO-UI-03 biometric account login retains server MFA gate before privileged reads',async()=>{
 const t=await setup({guest:true,admin:true,biometric:{available:true,enabled:true}});try{let reads=0;t.backend.signInWithBiometrics=async()=>t.setSession({user:{id:'user-1'}});t.backend.adminMfaStatus=async()=>({enforced:true,required:true,verified:false});t.backend.listBookings=t.backend.listProfiles=t.backend.listReceipts=async()=>{reads++;return []};await t.a.handleBiometric('signin');assert.equal(reads,0);assert.equal(t.a.currentAccount(),null);assert.equal(t.a.ui.screen,'mfa');}finally{t.close()}
});
test('BIO-UI-04 logout during biometric login cannot restore UI identity',async()=>{
 const t=await setup({guest:true,biometric:{available:true,enabled:true}});try{let done;t.backend.signInWithBiometrics=()=>new Promise(r=>done=r);const p=t.a.handleBiometric('signin');await t.a.logout();done();await p;assert.equal(t.a.currentAccount(),null);assert.equal(t.a.ui.screen,'account');}finally{t.close()}
});
test('BIO-UI-05 sign-in page shows fingerprint and explicit unchecked save-login consent',async()=>{
 const t=await setup({guest:true,biometric:{available:true,enabled:false}});try{t.a.navigate('account');assert.ok(t.w.document.querySelector('[data-action=biometric-signin] svg'));assert.equal(t.w.document.querySelector('[name=saveLogin]').checked,false);await t.a.handleBiometric('signin');assert.match(t.w.document.querySelector('#biometric-signin-help').textContent,/tick Save login/);}finally{t.close()}
});
test('BIO-UI-06 biometric customer sign-in opens normal account and forget keeps account signed in',async()=>{
 const bio={available:true,enabled:true};const t=await setup({guest:true,biometric:bio});try{t.backend.signInWithBiometrics=async()=>t.setSession({user:{id:'user-1'}});await t.a.handleBiometric('signin');assert.equal(t.a.currentAccount().id,'user-1');t.backend.forgetSavedLogin=()=>bio.enabled=false;await t.a.handleBiometric('forget');assert.equal(t.a.currentAccount().id,'user-1');assert.equal(t.w.document.querySelector('[data-action=biometric-forget]'),null);}finally{t.close()}
});

test('RANDY-01 newest created booking and walk-in appear first regardless of input order',async()=>{
 const t=await setup({admin:true});try{
  t.a.state.bookings=[booking(t.a),booking(t.a),booking(t.a)];
  t.a.state.bookings.forEach((b,i)=>Object.assign(b,{reference:['OLD','NEW','MIDDLE'][i],createdAt:['2026-09-01T00:00:00Z','2026-09-29T12:00:00Z','2026-09-15T00:00:00Z'][i],walkIn:i===1}));
  t.a.ui.adminTab='bookings';t.a.ui.screen='admin';t.a.render();
  assert.deepEqual(Array.from(t.w.document.querySelectorAll('.admin-record .booking-ref'),x=>x.textContent),['NEW','MIDDLE','OLD']);
  t.a.ui.adminMonth='2026-09';t.a.render();assert.equal(t.w.document.querySelector('.admin-record .booking-ref').textContent,'NEW');
 }finally{t.close()}
});
test('RANDY-02 top-right switch works both ways, retains selected admin tab and never grants customers admin',async()=>{
 const t=await setup({admin:true});try{t.a.ui.screen='admin';t.a.ui.adminTab='bookings';t.a.render();t.w.document.querySelector('[data-action=customer-view]').click();await tick();assert.equal(t.a.ui.screen,'home');assert.equal(t.a.currentAccount().role,'admin');t.w.document.querySelector('#topbar [data-action=open-management]').click();await tick();assert.equal(t.a.ui.screen,'admin');assert.equal(t.a.ui.adminTab,'bookings');}finally{t.close()}
 const c=await setup();try{c.a.navigate('home');assert.equal(c.w.document.querySelector('.view-switch'),null);c.a.navigate('admin');assert.match(c.w.document.querySelector('#app-main').textContent,/Administrator account required/);await tick();}finally{c.close()}
});
test('RANDY-03 admin date changes remove weekend-only times and clear stale time selection',async()=>{
 const t=await setup({admin:true});try{const b=booking(t.a);Object.assign(b,{date:'2026-10-03',time:'21:00'});t.a.state.bookings=[b];t.a.openEditBooking(b.reference);const f=t.w.document.querySelector('#edit-booking-form');assert.equal(f.querySelector('[name=time]').value,'21:00');const date=f.querySelector('[name=date]');date.value='2026-10-05';date.dispatchEvent(new t.w.Event('change'));assert.equal(f.querySelector('[name=time]').value,'');assert.equal(f.querySelector('[value="21:00"]'),null);assert.ok(f.querySelector('[value="19:00"]'));}finally{t.close()}
});
test('RANDY-04 customer and administrator calendars show the correct weekday/weekend times',async()=>{
 const t=await setup({admin:true});try{for(const [date,last,count] of [['2026-10-02','19:00',8],['2026-10-03','21:00',10],['2026-10-04','21:00',10]]){t.a.ui.screen='booking';t.a.ui.bookingStep=2;t.a.ui.draft.serviceId='essential';t.a.ui.draft.date=date;t.a.render();assert.equal(t.w.document.querySelectorAll('.slot').length,count);assert.ok(t.w.document.querySelector('.slot[data-time="'+last+'"]'));t.a.ui.screen='admin';t.a.ui.adminTab='schedule';t.a.ui.adminDate=date;t.a.render();assert.equal(t.w.document.querySelectorAll('.schedule-slot-admin').length,count);}}finally{t.close()}
});


test('BIO-UI-07 pre-rollout administrator can sign in with biometrics and switch views without an MFA setup gate',async()=>{
 const t=await setup({guest:true,admin:true,biometric:{available:true,enabled:true}});try{
  t.backend.signInWithBiometrics=async()=>t.setSession({user:{id:'user-1'}});
  t.backend.adminMfaStatus=async()=>({enforced:false,rolloutPending:true,required:false,verified:false});
  t.backend.listMfaFactors=async()=>{throw Error('Must not enrol before rollout')};
  await t.a.handleBiometric('signin');assert.equal(t.a.currentAccount().role,'admin');assert.equal(t.a.ui.mfa,null);
  t.a.navigate('account');assert.equal(t.w.document.querySelector('[data-action=mfa-backup]'),null);
  t.w.document.querySelector('[data-action=open-management]').click();await tick();assert.equal(t.a.ui.screen,'admin');
  t.w.document.querySelector('[data-action=customer-view]').click();await tick();assert.equal(t.a.ui.screen,'home');
 }finally{t.close()}
});
test('BIO-UI-08 malformed MFA status still blocks privileged reads',async()=>{
 const t=await setup({guest:true,admin:true});try{
  t.setSession({user:{id:'user-1'}});let reads=0;t.backend.listProfiles=t.backend.listBookings=async()=>{reads++;return []};
  t.backend.adminMfaStatus=async()=>({enforced:false,required:true,verified:true});
  assert.equal(await t.a.activateAccount(await t.backend.getMyProfile()),null);assert.equal(reads,0);assert.equal(t.a.ui.screen,'mfa');
 }finally{t.close()}
});
