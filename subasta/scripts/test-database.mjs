import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  $$;
  create function public.mi_mundo_is_admin() returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and email='owner@example.test');
  $$;
`);
await db.exec(await readFile(new URL('../supabase/001_auction.sql', import.meta.url), 'utf8'));
const ids = (await db.query('select gen_random_uuid() as owner,gen_random_uuid() as participant,gen_random_uuid() as runner,gen_random_uuid() as unverified')).rows[0];
for (const [role, id] of Object.entries(ids)) {
  await db.query('insert into auth.users values($1,$2,$3,$4)', [id, `${role}@example.test`, role === 'unverified' ? null : new Date().toISOString(), JSON.stringify({ name: role })]);
}
await db.exec(`insert into mi_mundo_private.auction_rounds(id,title,closes_at) values('muestra-2026','Prueba',clock_timestamp()+interval '1 day');
  insert into mi_mundo_private.auction_lots values('muestra-2026',1,'{"base":500,"title":"Obra"}'),('muestra-2026',2,'{"base":500,"title":"Otra"}');`);
async function rpc(role, action, data = {}) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[role] || '']);
  return (await db.query('select public.mi_mundo_auction($1,$2::jsonb) as result', [action, JSON.stringify(data)])).rows[0].result;
}
const profile = { name: 'Prueba', email: 'participant@example.test', whatsapp: '+526640000000', accepted: true, consent: false };
assert.equal((await rpc('anonymous','catalog')).user, null);
assert.equal((await rpc('anonymous','bid',{lot:1,amount:1000})).status,401);
assert.equal((await rpc('unverified','profile')).status,401);
assert.equal((await rpc('participant','admin')).status,403);
assert.equal((await rpc('participant','admin_action',{action:'settings',bankAccount:'123456789012345678'})).status,403);
assert.equal((await rpc('participant','save_profile',profile)).ok,true);
assert.equal((await rpc('participant','bid',{lot:1,amount:1000})).ok,true);
assert.equal((await rpc('runner','save_profile',{...profile,email:'runner@example.test'})).ok,true);
assert.equal((await rpc('runner','bid',{lot:1,amount:1500})).ok,true);
assert.equal((await rpc('participant','bid',{lot:1,amount:2000})).ok,true);
assert.equal((await rpc('participant','bid',{lot:1,amount:2200})).status,409);
assert.equal((await rpc('runner','catalog')).mine[0].amount,1500);
assert.equal((await rpc('runner','offers')).offers.length,0);
assert.equal((await rpc('owner','admin')).offers.length,0);
await db.exec("update mi_mundo_private.auction_rounds set closes_at=clock_timestamp() where id='muestra-2026'");
let offers = (await rpc('owner','admin')).offers;
assert.equal(offers.length,1);
assert.equal(offers[0].user_id,ids.participant);
assert.equal(offers[0].amount,2000);
assert.equal((await rpc('runner','offers')).offers.length,0);
assert.equal((await rpc('owner','admin_action',{action:'instructions',id:offers[0].id,url:'https://mpago.la/prueba-no-pagar'})).ok,true);
assert.equal((await rpc('owner','admin_action',{action:'notify',id:offers[0].id,confirmed:true})).ok,true);
offers=(await rpc('participant','offers')).offers;
assert.equal(offers[0].deadline-offers[0].notified_at,24*60*60*1000);
const deadline=offers[0].deadline;
assert.equal((await rpc('owner','admin_action',{action:'notify',id:offers[0].id,confirmed:true})).status,409);
assert.equal((await rpc('participant','offers')).offers[0].deadline,deadline);
await db.query("update mi_mundo_private.auction_offers set deadline=clock_timestamp()-interval '1 second' where id=$1",[offers[0].id]);
const expiredId=offers[0].id;
assert.equal((await rpc('owner','admin_action',{action:'paid',id:expiredId,reference:'late',confirmed:true})).status,409);
offers=(await rpc('owner','admin')).offers;
const next=offers.find(offer=>offer.status==='ready');
assert.equal(next.user_id,ids.runner);
assert.equal(next.amount,1500);
assert.equal(offers.filter(offer=>offer.status==='expired').length,1);
assert.equal((await rpc('owner','admin_action',{action:'instructions',id:next.id,url:'https://mpago.la/segunda-no-pagar'})).ok,true);
assert.equal((await rpc('owner','admin_action',{action:'notify',id:next.id,confirmed:true})).status,409);
assert.equal((await rpc('owner','admin_action',{action:'disable-link',id:expiredId,confirmed:true})).ok,true);
assert.equal((await rpc('owner','admin_action',{action:'notify',id:next.id,confirmed:true})).ok,true);
assert.equal((await rpc('owner','admin_action',{action:'paid',id:next.id,reference:'test-only',confirmed:true})).ok,true);
assert.equal((await rpc('owner','admin')).offers.filter(offer=>offer.status==='paid').length,1);
assert.equal((await rpc('participant','offers')).offers[0].mercado_pago_url,null);
const tables=(await db.query("select count(*)::int as count from pg_tables where schemaname='mi_mundo_private' and rowsecurity")).rows[0].count;
assert.equal(tables,5);
assert.equal((await db.query("select has_table_privilege('anon','mi_mundo_private.auction_bids','SELECT') as allowed")).rows[0].allowed,false);
assert.equal((await db.query("select has_function_privilege('anon','mi_mundo_private.auction_advance()','EXECUTE') as allowed")).rows[0].allowed,false);
await db.close();
console.log('PostgreSQL aislado: permisos, sesión, pujas, privacidad, cierre, 24 horas, siguiente postor y pago confirmado verificados.');
