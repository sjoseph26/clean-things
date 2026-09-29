const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const Core=require('../app/src/main/assets/core.js');
test('RANDY-DB targeted repair on older production schema',async t=>{const db=new PGlite();try{
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage; create schema extensions; create schema vault; create schema net;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$ select 0::bigint $$;
  `);

 for(const name of fs.readdirSync('supabase/migrations').sort()){
  if(name==='202609210001_release_repairs.sql')continue;
  await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8').replace(/create extension if not exists (pgcrypto|pg_net)( with schema extensions)?;/g,''));
 }
 const migration=fs.readFileSync('supabase/migrations/202609290003_payment_schedule_hotfix.sql','utf8');await db.exec(migration);
 const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',ADMIN='33333333-3333-4333-8333-333333333333';
 await db.query("insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test'),($3,'admin@example.test')",[A,B,ADMIN]);await db.query("update profiles set role='admin' where user_id=$1",[ADMIN]);
 const role=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'));};
 const base={serviceId:'essential',serviceMode:'bay',name:'Fixture',phone:'5926000000',vehicle:'Car',plate:'TEST',addOns:[],date:'2099-10-02',time:'19:00'};
 const create=async value=>(await db.query('select * from create_booking($1::jsonb)',[JSON.stringify({...base,...value})])).rows[0];
 let booking,proof;
 await t.test('hours match JavaScript for every day; anonymous availability denied',async()=>{await role(A);for(let day=1;day<=7;day++){const date='2099-10-0'+day;const rows=(await db.query('select * from appointment_availability($1::date)',[date])).rows;assert.deepEqual(rows.map(x=>x.service_time.slice(0,5)),Core.appointmentSlots(date).map(x=>x.value));}await role(null);await assert.rejects(db.query("select * from appointment_availability('2099-10-01')"),/permission denied/);});
 await t.test('weekend 9pm can be booked, weekday 9pm and duplicate slots rejected',async()=>{await role(A);booking=await create({date:'2099-10-03',time:'21:00'});assert.equal(booking.service_time,'21:00:00');proof=A+'/'+booking.id+'/fixture.png';await assert.rejects(create({date:'2099-10-05',time:'21:00'}),/offered/);await role(B);await assert.rejects(create({date:'2099-10-03',time:'21:00'}),/booked/);});
 await t.test('proof upload metadata is private and tied to its owner booking',async()=>{await role(B);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",[proof]),/row-level security/);await role(A);await db.query("insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",[proof]);await db.query('select * from update_my_booking($1::jsonb)',[JSON.stringify({reference:booking.reference,action:'submit_payment',paymentProofName:'fixture.png',paymentProofPath:proof})]);assert.equal((await db.query('select payment_proof_path from bookings where id=$1',[booking.id])).rows[0].payment_proof_path,proof);await role(B);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await role(ADMIN);assert.equal((await db.query('select * from storage.objects')).rows.length,1);});
 await t.test('false file paths and filename-only claims cannot become submitted proof',async()=>{await role(A);for(const value of [{paymentProofName:'fake.png'},{paymentProofPath:A+'/'+booking.id+'/missing.png'}])await assert.rejects(db.query('select * from update_my_booking($1::jsonb)',[JSON.stringify({reference:booking.reference,action:'submit_payment',...value})]));});
 await t.test('customer cannot overwrite/delete proof or close the business day',async()=>{await role(A);assert.equal((await db.query('delete from storage.objects where name=$1 returning *',[proof])).rows.length,0);assert.equal((await db.query("update storage.objects set name='changed' where name=$1 returning *",[proof])).rows.length,0);await assert.rejects(db.query("select set_day_availability('2099-10-04','blocked')"),/Administrator/);});
 await t.test('admin day closure covers evening slots; booked days cannot be closed',async()=>{await role(ADMIN);await assert.rejects(db.query("select set_day_availability('2099-10-03','blocked')"),/Move or cancel/);await db.query("select set_day_availability('2099-10-04','blocked')");const rows=(await db.query("select * from appointment_availability('2099-10-04')")).rows;assert.equal(rows.length,10);assert.ok(rows.every(x=>x.status==='blocked'));await role(A);await assert.rejects(create({date:'2099-10-04',time:'21:00'}),/blocked/);});
 await t.test('private bucket limits and additive schema are correct without enabling MFA',async()=>{await db.exec('reset role');const b=(await db.query("select * from storage.buckets where id='payment-proofs'")).rows[0];assert.equal(b.public,false);assert.equal(Number(b.file_size_limit),3145728);assert.deepEqual(b.allowed_mime_types,['image/jpeg','image/png','image/webp']);assert.equal((await db.query("select to_regprocedure('public.admin_mfa_status()') as f")).rows[0].f,null);});
}finally{await db.close()}});
