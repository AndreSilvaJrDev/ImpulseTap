import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {catalogSchema} from './catalog-schema';
import seed from '../../data/catalog-seed.json';

test('Postgres catalog permissions, price persistence, visibility, concurrency and atomic updates',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`);
  await db.exec(readFileSync('supabase/migrations/202610020001_catalog_admin.sql','utf8'));
  await db.exec(readFileSync('supabase/seed.sql','utf8'));
  await db.exec(`insert into impulsetap.admin_users(user_id) values('00000000-0000-4000-8000-000000000001');set role anon;`);
  const getPublic=async()=>{const r=await db.query<{catalog:unknown}>('select public.impulsetap_public_catalog() as catalog');return catalogSchema.parse(r.rows[0].catalog)};
  let catalog=await getPublic();assert.equal(catalog.source,'database');assert(!catalog.networks.some(n=>n.id==='spotify'));assert.equal(catalog.services.filter(s=>s.network==='youtube').length,3);
  const raw=await db.query<{catalog:unknown}>('select public.impulsetap_public_catalog() as catalog');assert(!JSON.stringify(raw.rows).includes('supplier_'));
  await assert.rejects(db.query('select * from impulsetap.supplier_services'));
  await assert.rejects(db.query('select public.impulsetap_admin_catalog()'));
  await assert.rejects(db.query(`select public.impulsetap_update_network('spotify',true,1)`));
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';`);
  await assert.rejects(db.query('select public.impulsetap_admin_catalog()'));
  await assert.rejects(db.query(`select public.impulsetap_update_network('spotify',true,1)`));
  await db.exec(`set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';`);
  const admin=await db.query<{catalog:{services:Array<{id:string;supplier_cost_per_1000:number;supplier_service_id:string}>}}>('select public.impulsetap_admin_catalog() as catalog');
  assert.equal(admin.rows[0].catalog.services.find(s=>s.id==='svc-053')!.supplier_service_id,'110');
  assert.equal(admin.rows[0].catalog.services.find(s=>s.id==='svc-053')!.supplier_cost_per_1000,1.42);
  // Activate then hide the same preserved network, no data deletion.
  await db.query(`select public.impulsetap_update_network('spotify',true,1)`);catalog=await getPublic();assert(catalog.networks.some(n=>n.id==='spotify'));
  await assert.rejects(db.query(`select public.impulsetap_update_network('spotify',false,1)`));
  await db.query(`select public.impulsetap_update_network('spotify',false,2)`);catalog=await getPublic();assert(!catalog.services.some(s=>s.network==='spotify'));
  const followers=structuredClone(seed.services.find(s=>s.id==='svc-053')!);followers.packages[0].price=1290;followers.supplier_cost_per_1000=2.25;
  await db.query(`select public.impulsetap_update_service($1,$2,$3::jsonb)`,['svc-053',1,JSON.stringify(followers)]);
  catalog=await getPublic();assert.equal(catalog.services.find(s=>s.id==='svc-053')!.packages[0].price,1290);assert(!JSON.stringify(catalog).includes('2.25'));
  await assert.rejects(db.query(`select public.impulsetap_update_service($1,$2,$3::jsonb)`,['svc-053',1,JSON.stringify(followers)]));
  // Invalid package after a price edit must roll back the entire RPC.
  const invalid=structuredClone(followers);invalid.packages[0].price=9999;invalid.packages[1].id='wrong-package';
  await assert.rejects(db.query(`select public.impulsetap_update_service($1,$2,$3::jsonb)`,['svc-053',2,JSON.stringify(invalid)]));
  catalog=await getPublic();assert.equal(catalog.services.find(s=>s.id==='svc-053')!.packages[0].price,1290);
  const live={...seed.services.find(s=>s.id==='svc-055')!,active:true};
  await assert.rejects(db.query(`select public.impulsetap_update_service($1,$2,$3::jsonb)`,['svc-055',1,JSON.stringify(live)]));
  const hidden={...followers,active:false};await db.query(`select public.impulsetap_update_service($1,$2,$3::jsonb)`,['svc-053',2,JSON.stringify(hidden)]);catalog=await getPublic();assert(!catalog.services.some(s=>s.id==='svc-053'));
  // Client cannot use the private projection directly even when logged in.
  await assert.rejects(db.query(`select impulsetap.service_public_json('svc-017',false)`));
 }finally{await db.close()}
});
