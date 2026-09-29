const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('AVL-HOTFIX works on the older schema, denies anonymous access and returns only slot status',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create table bookings(service_date date,service_time time,status text,walk_in boolean);
    create table availability_overrides(service_date date,service_time time,status text);
    insert into bookings values('2026-10-30','08:30','Confirmed',false),('2026-10-30','11:30','Cancelled',false),('2026-10-30','13:00','Completed',true);
    insert into availability_overrides values('2026-10-30','10:00','blocked');`);
  const sql=fs.readFileSync('supabase/migrations/202609290001_availability_hotfix.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec('set role anon');await assert.rejects(db.query("select * from public.appointment_availability('2026-10-30')"),/permission denied/);
  await db.exec('reset role');await db.exec("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);set role authenticated;");
  const rows=(await db.query("select * from public.appointment_availability('2026-10-30')")).rows;
  assert.equal(rows.length,6);assert.deepEqual(Object.keys(rows[0]).sort(),['service_time','status']);
  assert.equal(rows.find(x=>x.service_time==='08:30:00').status,'booked');assert.equal(rows.find(x=>x.service_time==='10:00:00').status,'blocked');
  assert.equal(rows.find(x=>x.service_time==='11:30:00').status,'open');assert.equal(rows.find(x=>x.service_time==='13:00:00').status,'open');
  assert.equal((await db.query('select * from public.appointment_availability(null)')).rows.length,0);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from bookings')).rows[0].n,3);
 }finally{await db.close()}
});
