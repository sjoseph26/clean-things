const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

test('DB: customer isolation, availability, proof policy and recovery', async t => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage; create schema extensions; create schema vault; create schema net;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
    create table auth.mfa_factors(id uuid default gen_random_uuid(),user_id uuid,factor_type text,status text);
    grant usage on schema auth,storage to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$ select 0::bigint $$;
  `);
  // PGlite substitutes only unavailable extension installation. Auth/storage
  // service tables above are fixtures; all application policies/RPCs run as shipped.
  const migrationDir=path.join(__dirname,'../supabase/migrations');
  for (const name of fs.readdirSync(migrationDir).sort()) {
    const sql=fs.readFileSync(path.join(migrationDir,name),'utf8')
      .replace(/create extension if not exists (pgcrypto|pg_net)( with schema extensions)?;/g,'');
    await db.exec(sql);
  }
  const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', ADMIN='33333333-3333-4333-8333-333333333333';
  await db.query(`insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test'),($3,'admin@example.test')`,[A,B,ADMIN]);
  await db.query(`update public.profiles set role='admin' where user_id=$1`,[ADMIN]);
  await db.query("insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')",[ADMIN]);
  const date=(await db.query(`select ((now() at time zone 'America/Guyana')::date + 2)::text as d`)).rows[0].d;
  const base={serviceId:'essential',serviceMode:'bay',date,time:'08:30',name:'Fixture A',phone:'5926000000',vehicle:'Test car',plate:'TEST',addOns:[],requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  const role=async(id)=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id||'']);await db.query(`select set_config('request.jwt.claim.aal',$1,false)`,[id===ADMIN?'aal2':'aal1']);await db.exec(`set role ${id?'authenticated':'anon'}`);};
  const create=(draft)=>db.query('select (public.create_booking($1::jsonb)).*',[JSON.stringify(draft)]);
  const update=(input)=>db.query('select (public.update_my_booking($1::jsonb)).*',[JSON.stringify(input)]);
  let booking;
  await t.test('SEC-01 anonymous booking denied',async()=>{await role(null);await assert.rejects(create(base),/permission denied/);});
  await t.test('DATA-01 valid booking and retry return one record',async()=>{await role(A);booking=(await create(base)).rows[0];const retry=(await create(base)).rows[0];assert.equal(retry.id,booking.id);assert.equal((await db.query('select * from bookings')).rows.length,1);});
  await t.test('SEC-02 other customer cannot read booking/profile',async()=>{await role(B);assert.equal((await db.query('select * from bookings')).rows.length,0);assert.equal((await db.query('select * from profiles')).rows.length,1);});
  await t.test('AVL-01 occupied slot visible without private details',async()=>{const rows=(await db.query('select * from appointment_availability($1::date)',[date])).rows;assert.equal(rows.find(r=>r.service_time==='08:30:00').status,'booked');assert.deepEqual(Object.keys(rows[0]).sort(),['service_time','status']);});
  await t.test('AVL-02 conflicting account booking denied',async()=>{await assert.rejects(create({...base,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),/booked/);});
  await t.test('SEC-03 customer cannot change other booking via RPC',async()=>{await assert.rejects(update({reference:booking.reference,action:'request_cancel'}),/not found for this account/);});
  await t.test('SEC-04 customer cannot promote own role or edit prices/settings',async()=>{
    await assert.rejects(db.query("update profiles set role='admin' where user_id=$1",[B]),/Only an administrator/);
    await assert.rejects(db.query("update profiles set email='changed@example.test' where user_id=$1",[B]),/verified authentication/);
    assert.equal((await db.query("update services set price=1 returning *")).rows.length,0);
    await assert.rejects(db.query(`select save_public_settings(' {"business_name":"x","mmg_account_name":"x","mmg_number":"x"}'::jsonb)`),/Administrator/);
  });
  await t.test('VAL-01 missing/invalid schedule and phone rejected',async()=>{
    for(const changes of [{date:null},{time:null},{time:'03:12'},{phone:'-------'},{phone:'abc5926000000'},{serviceMode:null},{addOns:['unknown']}]) await assert.rejects(create({...base,requestId:null,...changes}));
  });
  await t.test('AVL-03 whole-day blocking is atomic',async()=>{
    await role(ADMIN);await assert.rejects(db.query('select set_day_availability($1,$2)',[date,'blocked']),/Move or cancel/);
    assert.equal((await db.query('select * from availability_overrides')).rows.length,0);
    await db.query("insert into availability_overrides(service_date,service_time,status) values($1,'10:00','blocked')",[date]);
    await role(A);await assert.rejects(create({...base,requestId:null,time:'10:00'}),/blocked/);
  });
  const proof=A+'/'+booking.id+'/proof.png';
  await t.test('PAY-01 image metadata accepted only in own booking folder',async()=>{
    await role(B);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",[proof]),/row-level security/);
    await role(A);await db.query("insert into storage.objects(bucket_id,name) values('payment-proofs',$1)",[proof]);
  });
  await t.test('PAY-02 filename without stored proof is rejected',async()=>{await assert.rejects(update({reference:booking.reference,action:'submit_payment',paymentProofName:'fake.png'}),/upload a proof image/);});
  await t.test('PAY-03 wrong path rejected and real path linked to exact booking',async()=>{
    await assert.rejects(update({reference:booking.reference,action:'submit_payment',paymentProofPath:B+'/'+booking.id+'/fake.png'}),/not stored/);
    const row=(await update({reference:booking.reference,action:'submit_payment',paymentProofPath:proof,paymentProofName:'proof.png'})).rows[0];assert.equal(row.payment_proof_path,proof);assert.equal(row.payment_status,'Pending review');
  });
  await t.test('PAY-04 proof private to owner and administrator, immutable to customer',async()=>{
    await role(B);assert.equal((await db.query("select * from storage.objects where bucket_id='payment-proofs'")).rows.length,0);
    await role(A);assert.equal((await db.query("delete from storage.objects where name=$1 returning *",[proof])).rows.length,0);
    assert.equal((await db.query("update storage.objects set name='replacement' where name=$1 returning *",[proof])).rows.length,0);
    await role(ADMIN);assert.equal((await db.query("select * from storage.objects where name=$1",[proof])).rows.length,1);
  });
  await t.test('PAY-05 verified completed booking creates one linked receipt',async()=>{
    await db.query("update bookings set payment_status='Paid',status='Completed' where id=$1",[booking.id]);
    await db.query("update bookings set notes='Checked' where id=$1",[booking.id]);
    const receipts=(await db.query('select * from receipts')).rows;assert.equal(receipts.length,1);assert.equal(receipts[0].booking_id,booking.id);assert.equal(Number(receipts[0].amount),3000);
    await assert.rejects(db.query('update bookings set total=1 where id=$1',[booking.id]),/reviewed adjustment/);
  });
  await t.test('SEC-05 customer cannot revert a verified payment',async()=>{await role(A);await assert.rejects(update({reference:booking.reference,action:'submit_payment',paymentReference:'again'}),/no longer|already verified/);});
  await t.test('SEC-06 receipt private to owner and raw availability metadata hidden',async()=>{
    assert.equal((await db.query('select * from receipts')).rows.length,1);
    await role(B);assert.equal((await db.query('select * from receipts')).rows.length,0);
    assert.equal((await db.query('select * from availability_overrides')).rows.length,0);
  });
  await t.test('REC-01 restore a database snapshot and reconcile linked records',async()=>{
    await db.exec('reset role');const snapshot=await db.dumpDataDir();
    const restored=new PGlite({loadDataDir:snapshot});
    assert.deepEqual((await restored.query('select id,reference,payment_proof_path,total from bookings order by id')).rows,(await db.query('select id,reference,payment_proof_path,total from bookings order by id')).rows);
    assert.deepEqual((await restored.query('select * from receipts order by id')).rows,(await db.query('select * from receipts order by id')).rows);
    assert.deepEqual((await restored.query('select name from storage.objects order by name')).rows,(await db.query('select name from storage.objects order by name')).rows);
    await restored.close();
  });
  await db.close();
});
