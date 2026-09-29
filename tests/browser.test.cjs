const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const out=path.resolve(__dirname,'../test-results/browser');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCwAAAABJRU5ErkJggg==','base64');
const fixtureKey=['sb','publishable','browser','fixture'].join('_');
const fixturePassword=['Example',String(100+23)].join('');
fs.mkdirSync(out,{recursive:true});
const results=[];const violations=[];const runtimeErrors=[];
const server=http.createServer((req,res)=>{
  const filename=req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0].slice(1));
  if(filename==='config.js'){res.setHeader('Content-Type','application/javascript');res.end(`window.CLEAN_THINGS_CONFIG={supabaseUrl:"https://fixture.supabase.co",supabasePublishableKey:${JSON.stringify(fixtureKey)}};`);return;}
  const file=path.join(assets,filename);
  if(!file.startsWith(assets+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));
});
async function inspect(page,name,width,theme,screenshot=false){
  // Measure settled UI, not the translucent frames of entrance animations.
  await page.evaluate(async()=>{for(let i=0;i<4;i++){const active=document.getAnimations().filter(a=>a.playState==='running');if(!active.length)break;await Promise.all(active.map(a=>a.finished.catch(()=>{})));}});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,`Horizontal overflow: ${name} ${width} ${theme}`);
  await page.evaluate(axe);
  const report=await page.evaluate(()=>axe.run(document,{runOnly:{type:'rule',values:['color-contrast','label','button-name','link-name','aria-valid-attr','aria-valid-attr-value']}}));
  for(const v of report.violations)violations.push({name,width,theme,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))});
  if(screenshot)await page.screenshot({path:path.join(out,`${width}-${theme}-${name}.png`),fullPage:false});
  results.push({name,width,theme,horizontalOverflow:overflow,axeViolations:report.violations.length});
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 if(!process.env.CT_BIOMETRIC_ONLY) for(const width of [360,393,412]) for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:873},geolocation:{latitude:6.82,longitude:-58.16},permissions:['geolocation']});
  const page=await context.newPage();let admin=false;let records=[];let uploadBytes=0;let serviceLoads=0;let mfaVerified=false;
  let factors=width===393?[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',factor_type:'totp',status:'verified',friendly_name:'Primary authenticator'}]:[];
  page.on('pageerror',e=>runtimeErrors.push(e.message));
  await page.addInitScript(theme=>localStorage.setItem('cleanthings.prototype.v1',JSON.stringify({preferences:{theme}})),theme);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='tile.openstreetmap.org')return route.fulfill({contentType:'image/png',body:png});
    if(url.hostname!=='fixture.supabase.co')return route.abort();
    const p=url.pathname;let body=[];
    if(p.startsWith('/auth/v1/token')){mfaVerified=false;body={access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'11111111-1111-4111-8111-111111111111'}};}
    else if(p==='/rest/v1/rpc/admin_mfa_status')body={enforced:true,required:admin,verified:mfaVerified};
    else if(p==='/auth/v1/user')body={id:'11111111-1111-4111-8111-111111111111',factors};
    else if(p==='/auth/v1/factors'){
      const id=factors.length?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      factors.push({id,factor_type:'totp',status:'unverified',friendly_name:'New authenticator'});
      body={id,totp:{secret:'JBSWY3DPEHPK3PXP',qr_code:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="white"/><path d="M2 2h10v10H2zm18 0h10v10H20zM2 20h10v10H2zm18 0h10v10H20z" fill="black"/></svg>'}};
    }else if(p.endsWith('/challenge'))body={id:'challenge-fixture'};
    else if(p.endsWith('/verify')){
      if(route.request().postDataJSON().code!=='123456')return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({code:'mfa_verification_failed',message:'Invalid code'})});
      mfaVerified=true;factors.forEach(f=>{if(p.includes(f.id))f.status='verified'});
      body={access_token:'fixture-aal2',refresh_token:'fixture-refresh-aal2',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111'}};
    }
    else if(p==='/rest/v1/profiles')body=[{user_id:'11111111-1111-4111-8111-111111111111',name:'Test Customer',phone:'5926000000',email:'customer@example.test',role:admin?'admin':'customer'}];
    else if(p==='/rest/v1/services'){serviceLoads++;body=[{id:'essential',name:'Essential Wash',icon:'🚙',price:3000,duration:'40 min',description:'Exterior wash and dry',includes:['Wash','Dry'],add_ons:[{id:'tyre-shine',name:'Tyre shine',description:'Finishing care',price:800}],enabled:true}];}
    else if(p==='/rest/v1/app_settings')body=[{key:'business_name',value:'Test Clean Things'},{key:'mmg_account_name',value:'Demo Merchant'},{key:'mmg_number',value:'000-0000'}];
    else if(p==='/rest/v1/rpc/appointment_availability')body=[{service_time:'10:00',status:'booked'}];
    else if(p==='/rest/v1/bookings'){
      if(route.request().method()==='PATCH')Object.assign(records[0],route.request().postDataJSON());
      if(route.request().method()==='DELETE')records=[];
      body=records;
    }
    else if(p==='/rest/v1/rpc/create_booking'){
      const d=route.request().postDataJSON().input;
      body={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',reference:'CT-FIXTURE',user_id:'11111111-1111-4111-8111-111111111111',service_id:d.serviceId,service_name:'Essential Wash',add_ons:d.addOns,service_mode:d.serviceMode,service_date:d.date,service_time:d.time,customer_name:d.name,customer_phone:d.phone,vehicle:d.vehicle,plate:d.plate,location:d.location,location_pin:d.locationPin,total:3000,status:'Pending confirmation',payment_status:'Not submitted'};records=[body];
    }else if(p.startsWith('/storage/v1/object/payment-proofs/')){uploadBytes=route.request().postDataBuffer().length;body={Key:p};}
    else if(p==='/rest/v1/rpc/update_my_booking'){const d=route.request().postDataJSON().input;Object.assign(records[0],{payment_status:'Pending review',payment_method:'MMG',payment_reference:d.paymentReference,payment_proof_name:d.paymentProofName,payment_proof_path:d.paymentProofPath});body=records[0];}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  const start=performance.now();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByText('● Live database',{exact:true}).waitFor();const homeMs=performance.now()-start;
  await inspect(page,'home',width,theme,true);
  assert.equal(await page.locator('.refresh-button').count(),0);
  if(width===393){
    const beforeRefresh=serviceLoads;
    await page.evaluate(()=>{
      const target=document.querySelector('#app-main h2')||document.querySelector('#app-main');
      for(const [type,y] of [['touchstart',0],['touchmove',155]]){
        const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{clientX:100,clientY:y}]});target.dispatchEvent(event);
      }
    });
    assert.equal(await page.locator('#pull-refresh-indicator').isVisible(),true);
    await inspect(page,'pull-refresh',width,theme,true);
    await page.evaluate(()=>{const event=new Event('touchend',{bubbles:true});Object.defineProperty(event,'touches',{value:[]});document.querySelector('#app-main').dispatchEvent(event);});
    await page.waitForFunction(()=>document.getElementById('refresh-status').textContent==='Up to date.');
    assert.equal(serviceLoads,beforeRefresh+1);
    assert.equal(await page.locator('#pull-refresh-indicator').isVisible(),false);
  }

  await page.locator('[data-screen=services]').first().click();await inspect(page,'services',width,theme);
  await page.locator('[data-action=service-details]').first().click();await page.goBack();
  assert.equal(await page.locator('[role=dialog]').count(),0);assert.ok(page.url().endsWith('#services'));
  await page.locator('[data-screen=account]').click();await inspect(page,'signin',width,theme);
  await page.locator('[data-mode=create]').click();await inspect(page,'signup',width,theme);
  await page.locator('[data-mode=signin]').click();await page.locator('#customer-email').fill('customer@example.test');await page.locator('#customer-password').fill(fixturePassword);await page.locator('#customer-login-form [type=submit]').click();await page.getByRole('heading',{name:'Test Customer'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('cleanthings.supabase.session.v1')),null);
  await inspect(page,'account-protection',width,theme,true);
  await page.locator('[data-action=home]').click();await page.locator('[data-action=start-booking]').first().click();await page.locator('.choice-card').first().click();await page.locator('[data-action=booking-next]').click();await page.locator('.slot[data-time="08:30"]:enabled').waitFor();await page.locator('.choice-card').filter({has:page.locator('[value=mobile]')}).click();await page.locator('[data-time="08:30"]').click();await inspect(page,'schedule',width,theme,true);await page.locator('[data-action=booking-next]').click();
  await page.locator('#vehicle').fill('Test vehicle');await page.locator('#plate').fill('TEST-001');await page.locator('#notes').fill('Preserve this note');await page.locator('[name=waterConfirmed]').check();await page.locator('[data-action=choose-current-location]').click();await page.getByText('Current location found.',{exact:false}).waitFor();
  const before=await page.locator('#map-latitude').inputValue();await page.locator('[aria-label="Zoom in"]').click();assert.equal(await page.locator('#map-latitude').inputValue(),before);await inspect(page,'map',width,theme,true);await page.locator('[data-map-save]').click();assert.equal(await page.locator('#notes').inputValue(),'Preserve this note');await inspect(page,'details',width,theme);
  await page.locator('#details-form [type=submit]').click();await page.locator('#confirm-accuracy').check();await inspect(page,'review',width,theme);const submitStart=performance.now();await page.locator('[data-action=confirm-booking]').click();await page.getByRole('heading',{name:'Booking request sent'}).waitFor();const submitMs=performance.now()-submitStart;await inspect(page,'success',width,theme);
  await page.locator('[data-action=pay-booking]').first().click();await inspect(page,'payment',width,theme,true);await page.locator('#payment-proof').setInputFiles({name:'proof.png',mimeType:'image/png',buffer:png});await page.locator('#payment-form [type=submit]').click();await page.getByText('Pending review',{exact:true}).waitFor();assert.equal(uploadBytes,png.length);
  await inspect(page,'bookings',width,theme);
  // Separate privileged fixture sign-in; server-role enforcement is tested in database.test.cjs.
  await page.locator('[data-screen=account]').click();await page.locator('[data-action=customer-logout]').click();admin=true;
  await page.locator('#customer-email').fill('admin@example.test');await page.locator('#customer-password').fill(fixturePassword);await page.locator('#customer-login-form [type=submit]').click();await page.getByRole('heading',{name:'Administrator verification'}).waitFor();
  if(!factors.some(f=>f.status==='verified'))await page.locator('[data-action=mfa-start]').click();
  await page.locator('#mfa-code').waitFor();await inspect(page,'mfa-verification',width,theme,true);
  assert.equal(await page.getByRole('heading',{name:'Business overview'}).count(),0);
  await page.locator('#mfa-code').fill('000000');await page.locator('#mfa-form [type=submit]').click();await page.getByText('That code was not accepted.',{exact:false}).waitFor();
  await page.locator('#mfa-code').fill('123456');await page.locator('#mfa-form [type=submit]').click();await page.getByRole('heading',{name:'Business overview'}).waitFor();await inspect(page,'admin',width,theme,true);
  await page.locator('[data-tab=bookings]').first().click();await inspect(page,'admin-bookings',width,theme,true);
  await page.locator('#admin-booking-month').fill('2099-01');assert.equal(await page.locator('.admin-record').count(),0);
  await page.locator('#clear-booking-month').click();assert.equal(await page.locator('.admin-record').count(),1);
  await page.locator('[data-action=edit-booking]').first().click();await page.locator('#edit-booking-form [name=notes]').fill('Changed through admin');
  await page.locator('#edit-booking-form [type=submit]').click();await page.locator('[role=dialog]').waitFor({state:'detached'});assert.equal(records[0].notes,'Changed through admin');
  await page.locator('[data-action=delete-booking]').first().click();await page.locator('[data-action=confirm-delete-booking]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});assert.equal(records.length,0);
  await page.locator('[data-tab=more]').click();await page.locator('[data-tab=services]').click();await page.locator('[data-action=edit-service]').first().click();
  await page.locator('#add-service-addon').click();await page.locator('[data-addon-name]').nth(1).fill('Seat care');await page.locator('[data-addon-description]').nth(1).fill('Deep cleaning');await page.locator('[data-addon-price]').nth(1).fill('1500');
  await inspect(page,'admin-addons',width,theme,true);
  assert.equal(await page.evaluate(()=>window.CleanThingsHandleBack()),true);assert.equal(await page.locator('[role=dialog]').count(),0);
  await page.locator('[data-tab=schedule]').click();await page.locator('#admin-date').waitFor();await inspect(page,'admin-schedule',width,theme);
  await page.locator('[data-tab=more]').click();await page.locator('[data-tab=settings]').click();await inspect(page,'admin-settings',width,theme);
  results.push({name:'local-mocked-timing',width,theme,homeMs:Number(homeMs.toFixed(1)),submitMs:Number(submitMs.toFixed(1))});
  if(width===393 && theme==='light'){
    await page.locator('[data-action=home]').click();await page.locator('[data-screen=account]').click();await page.locator('[data-action=mfa-backup]').click();await page.locator('[data-action=mfa-start]').click();await page.locator('#mfa-code').waitFor();await inspect(page,'mfa-backup',width,theme,true);
    await page.locator('#mfa-code').fill('123456');await page.locator('#mfa-form [type=submit]').click();await page.getByRole('heading',{name:'Business overview'}).waitFor();assert.equal(factors.filter(f=>f.status==='verified').length,2);
    await page.reload();await page.getByText('● Live database',{exact:true}).waitFor();
    await page.locator('[data-screen=account]').click();await page.getByRole('heading',{name:'Account access'}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('cleanthings.supabase.session.v1')),null);
  }
  await context.close();
 }
 for(const width of [360,393,412]) for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:873}});const page=await context.newPage();let protectedReads=0;
  page.on('pageerror',e=>runtimeErrors.push(e.message));
  await page.addInitScript(theme=>localStorage.setItem('cleanthings.prototype.v1',JSON.stringify({preferences:{theme}})),theme);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/session-store.js')return route.fulfill({contentType:'application/javascript',body:`(()=>{
      let enabled=true,locked=true,active={access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1'}},attempt=0;
      window.CleanThingsSessionStore={read:()=>locked?null:active,write:v=>active=v,clear:()=>{enabled=false;locked=false;active=null},
      status:()=>({encrypted:true,persistent:true,message:'Your saved sign-in is encrypted on this device.',biometric:{available:true,enabled,locked,reason:''}}),
      lock:()=>{locked=true},biometric:async action=>{if(action==='unlock' && attempt++===0)throw Error('Verification cancelled. Try again.');enabled=action!=='disable';locked=false}};
    })();`});
    if(url.hostname==='127.0.0.1')return route.continue();
    let body=[];
    if(url.pathname==='/rest/v1/profiles'){protectedReads++;body=[{user_id:'user-1',name:'Biometric tester',phone:'5926000000',email:'fixture@example.test',role:'customer'}];}
    if(url.pathname==='/rest/v1/bookings' || url.pathname==='/rest/v1/receipts')protectedReads++;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByRole('heading',{name:'Unlock Clean Things'}).waitFor();
  assert.equal(protectedReads,0);await inspect(page,'biometric-locked',width,theme,true);
  await page.locator('[data-action=biometric-unlock]').click();await page.getByText('Verification cancelled. Try again.',{exact:true}).first().waitFor();
  assert.equal(protectedReads,0);await inspect(page,'biometric-cancelled',width,theme);
  await page.locator('[data-action=biometric-unlock]').click();await page.getByRole('heading',{name:'Sign-in protection'}).waitFor();
  assert.ok(protectedReads>0);await inspect(page,'biometric-enabled',width,theme,true);
  await page.locator('[data-action=biometric-disable]').click();await page.locator('[data-action=biometric-enable]').waitFor();
  await inspect(page,'biometric-disabled',width,theme);
  await page.locator('[data-action=biometric-enable]').click();await page.locator('[data-action=biometric-lock]').waitFor();await page.locator('[data-action=biometric-lock]').click();
  await page.getByRole('heading',{name:'Unlock Clean Things'}).waitFor();await page.locator('[data-action=biometric-password]').click();
  await page.locator('#customer-login-form').waitFor();assert.equal(await page.locator('[data-action=biometric-unlock]').count(),0);
  assert.equal(await page.locator('[data-action=biometric-signin] svg').count(),1);
  await inspect(page,'biometric-signin',width,theme,true);
  const beforeHint=protectedReads;await page.locator('[data-action=biometric-signin]').click();
  await page.getByText('Sign in with your password first, then enable biometric unlock under Account → Sign-in protection.',{exact:true}).waitFor();
  assert.equal(protectedReads,beforeHint);assert.equal(await page.locator('#customer-login-form').count(),1);
  await inspect(page,'biometric-signin-setup',width,theme);

  await context.close();
 }
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,violations,runtimeErrors,note:'Chromium with mocked remote responses and simulated GPS; not live/device certification.'},null,2));}
 assert.deepEqual(runtimeErrors,[],'Browser runtime errors');
 assert.equal(violations.length,0,'Accessibility issues: inspect test-results/browser/results.json');
 console.log(`${results.length} browser state/timing results; zero selected-rule accessibility violations.`);
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
