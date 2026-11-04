import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
const owner=randomUUID(), other=randomUUID(), visitor=randomUUID(), session=randomUUID();
await db.exec(`create role anon; create role authenticated; create schema auth; create schema mi_mundo_private;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
create function public.mi_mundo_is_admin() returns boolean language sql stable as $$ select auth.uid()='${owner}'::uuid $$;
create table mi_mundo_private.auction_participants(user_id uuid);
create table mi_mundo_private.domino_usernames(user_id uuid,league text);
insert into auth.users values('${owner}',now(),false),('${other}',null,false);
insert into mi_mundo_private.auction_participants values('${other}');
insert into mi_mundo_private.domino_usernames values('${other}','ensenada'),('${other}','todos-santos');`);
await db.exec(await readFile(new URL('../../analytics/001_traffic.sql',import.meta.url),'utf8'));
async function track(id,seq,section,kind='pageview') {
 return db.query('select public.mi_mundo_track($1,$2,$3,$4,$5,$6,$7)',[id,visitor,session,seq,section,'',kind]);
}
await db.exec(await readFile(new URL('../../analytics/002_exclude_owner.sql',import.meta.url),'utf8'));
await db.exec('set role anon');
const first=randomUUID();
await track(first,1,'inicio'); await track(first,1,'inicio'); // retry is idempotent
await track(randomUUID(),2,'libro'); await track(randomUUID(),3,'libro');
await track(randomUUID(),4,'subasta'); await track(randomUUID(),5,'libro','book_form');
await assert.rejects(db.query('select * from mi_mundo_private.traffic_events'),/permission denied/);
await assert.rejects(db.query('select public.mi_mundo_traffic_report(30)'),/permission denied/);
await assert.rejects(track(randomUUID(),6,'contains?email=private'),/check constraint/);
await db.exec('reset role; set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
await assert.rejects(db.query('select public.mi_mundo_traffic_report(30)'),/Solo el administrador/);
await assert.rejects(db.query('select * from mi_mundo_private.traffic_events'),/permission denied/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
await track(randomUUID(),9,'subasta'); // verified owner is ignored
const report=(await db.query('select public.mi_mundo_traffic_report(30) as report')).rows[0].report;
assert.deepEqual(report.total,{views:4,visitors:1,sessions:1});
assert.equal(report.sections.find(s=>s.section==='libro').views,2);
assert.deepEqual(report.routes,[{route:'inicio → libro → subasta',sessions:1}]);
assert.equal(report.actions.book_form,1);
assert.equal(report.registrations.domino,1); // same participant in two leagues
assert.equal(report.registrations.auction,1);
await assert.rejects(db.query('select public.mi_mundo_traffic_report(0)'),/Periodo no válido/);
await db.close();

const source=await readFile(new URL('../../mi-mundo-traffic.js',import.meta.url),'utf8');
const store=()=>{const items=new Map(); return {getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v)};};
const localStorage=store(),sessionStorage=store();
let now=10000000;
const requests=[];
const requestHeaders=[];
async function page(path,search='',fail=false) {
 const events={};
 const context={ location:{hostname:'mundo.cositasdeh.mx',pathname:path,search},
  navigator:{onLine:true},crypto:{randomUUID},URL,URLSearchParams,
  Date:class extends Date{static now(){return now;}},localStorage,sessionStorage,
  document:{addEventListener:(key,cb)=>events[key]=cb},addEventListener:(key,cb)=>events[key]=cb,setInterval:()=>{},
  fetch:async(url,options)=>{requests.push(JSON.parse(options.body));requestHeaders.push(options.headers);return {ok:!fail}} };
 context.window=context;
 vm.runInNewContext(source,context);
 await new Promise(resolve=>setTimeout(resolve,10));
 return context;
}
await page('/'); await page('/libro/'); await page('/martes-de-domino/','?liga=ensenada&email=private');
assert.equal(new Set(requests.map(r=>r.p_visitor_id)).size,1);
assert.equal(new Set(requests.map(r=>r.p_session_id)).size,1);
assert.deepEqual(requests.map(r=>r.p_sequence),[1,2,3]);
assert.equal(requests[2].p_section,'domino'); assert.equal(requests[2].p_area,'ensenada');
assert.ok(!JSON.stringify(requests).includes('private'));
now+=31*60000; await page('/subasta/');
assert.notEqual(requests[3].p_session_id,requests[2].p_session_id);
const n=requests.length; await page('/estadisticas/'); assert.equal(requests.length,n);
await page('/libro/','',true); const failed=requests.at(-1);
await page('/subasta/'); assert.equal(requests[n+1].p_event_id,failed.p_event_id);
localStorage.setItem('mm-traffic-disabled','true');
const excludedCount=requests.length;
await page('/libro/');
assert.equal(requests.length,excludedCount);
assert.deepEqual(JSON.parse(sessionStorage.getItem('mm-traffic-pending')),[]);
localStorage.setItem('mm-traffic-disabled','false');
localStorage.setItem('mi-mundo-auth-v1',JSON.stringify({access_token:'test-session-token',expires_at:now/1000-1}));
const beforeExpired=requests.length;
await page('/libro/');
assert.equal(requests.length,beforeExpired);
localStorage.setItem('mi-mundo-auth-v1',JSON.stringify({access_token:'test-session-token',expires_at:now/1000+3600}));
await page('/subasta/');
assert.equal(requestHeaders.at(-1).Authorization,'Bearer test-session-token');
assert.equal(JSON.parse(sessionStorage.getItem('mm-traffic-pending')).length,0);
localStorage.setItem('mi-mundo-auth-v1','null');
await page('/laboratorio-digital-cria/cotizador-giclees/','?taller=never-send');
assert.equal(requests.at(-1).p_section,'laboratorio-digital-cria--cotizador-giclees');
assert.ok(!JSON.stringify(requests.at(-1)).includes('taller'));
console.log('PASS: RLS, admin-only report, idempotency, unique totals, journeys, registration deduplication, invalid input, session expiry, private URL stripping, retry queue.');
