const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('MFA-DB mandatory TOTP is enforced by existing RLS and RPC checks, including older-schema installs',async()=>{
 const db=new PGlite();const admin='11111111-1111-4111-8111-111111111111',customer='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true))$$;
  grant usage on schema auth to anon,authenticated;
  create table auth.mfa_factors(user_id uuid,status text,factor_type text);
  create table profiles(user_id uuid,role text);
  create function public.is_admin() returns boolean language sql stable security definer as $$select exists(select 1 from profiles where user_id=auth.uid() and role='admin')$$;
  create table services(id int,price int);insert into services values(1,3000);
  alter table services enable row level security;
  create policy public_read on services for select using(true);
  create policy admin_write on services for update to authenticated using(public.is_admin()) with check(public.is_admin());
  grant select,update on services to authenticated;
  create function public.change_price() returns void language plpgsql security definer as $$begin if not public.is_admin() then raise exception 'Administrator access required';end if;update services set price=4000;end$$;
  grant execute on function public.change_price() to authenticated;`);
  await db.query("insert into profiles values($1,'admin'),($2,'customer')",[admin,customer]);
  const migration=fs.readFileSync('supabase/migrations/202609290002_admin_mfa.sql','utf8');await db.exec(migration);await db.exec(migration);
  const as=async(id,aal)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false)",[id||'',aal||'']);await db.exec('set role '+(id?'authenticated':'anon'));};
  await as(admin,'aal1');assert.equal((await db.query('select public.is_admin() as allowed')).rows[0].allowed,false);
  assert.equal((await db.query('update services set price=1 returning *')).rows.length,0);await assert.rejects(db.query('select public.change_price()'),/Administrator/);
  const status=(await db.query('select public.admin_mfa_status() as s')).rows[0].s;assert.deepEqual(status,{enforced:true,required:true,verified:false});
  await as(admin,'aal2');assert.equal((await db.query('select public.is_admin() as allowed')).rows[0].allowed,false,'aal2 without a verified TOTP is denied');
  await db.exec('reset role');await db.query("insert into auth.mfa_factors values($1,'unverified','totp')",[admin]);await as(admin,'aal2');assert.equal((await db.query('select public.is_admin() as allowed')).rows[0].allowed,false);
  await db.exec("reset role;update auth.mfa_factors set status='verified'");
  await as(admin,'aal1');assert.equal((await db.query('update services set price=1 returning *')).rows.length,0);
  await as(admin,'aal2');await db.query('select public.change_price()');assert.equal((await db.query('select price from services')).rows[0].price,4000);
  await as(customer,'aal2');assert.equal((await db.query('select public.is_admin() as allowed')).rows[0].allowed,false);assert.equal((await db.query('update services set price=1 returning *')).rows.length,0);await assert.rejects(db.query('select public.change_price()'),/Administrator/);
  await as(null,'');await assert.rejects(db.query('select public.admin_mfa_status()'),/permission denied/);
  await db.exec('reset role;delete from auth.mfa_factors');await as(admin,'aal2');assert.equal((await db.query('select public.is_admin() as allowed')).rows[0].allowed,false,'removed factor invalidates stale aal2 admin authorization');
 }finally{await db.close()}
});
