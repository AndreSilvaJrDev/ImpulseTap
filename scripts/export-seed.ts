import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {catalogSchema,serviceSchema,networkSchema} from '../src/lib/catalog-schema';
const seed=JSON.parse(readFileSync('data/catalog-seed.json','utf8'));
// Explicit allowlist removes ALL supplier fields from the demonstrative client payload.
const networks=seed.networks.map((n:unknown)=>networkSchema.parse(n)).filter((n:{active:boolean})=>n.active);
const services=seed.services.map((s:unknown)=>serviceSchema.parse(s)).filter((s:{active:boolean;network:string})=>s.active&&networks.some((n:{id:string})=>n.id===s.network));
const publicCatalog=catalogSchema.parse({networks,services,orderBumps:seed.orderBumps,source:'demo'});
writeFileSync('src/lib/demo-catalog.json',JSON.stringify(publicCatalog,null,2)+'\n');
// Private seed is SQL for the owner's migration process, never placed under public/ or imported by UI.
const lit=(v:unknown)=>v===null||v===undefined?'NULL':typeof v==='boolean'?String(v):typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const json=(v:unknown)=>lit(JSON.stringify(v))+'::jsonb';
const lines=['-- Bootstrap only: preserves existing admin edits. Run once after migrations.','begin;'];
for(const n of seed.networks)lines.push(`insert into impulsetap.social_networks (id,name,description,color,hosts,active) values (${[n.id,n.name,n.description,n.color].map(lit)},${json(n.hosts)},${lit(n.active)}) on conflict (id) do nothing;`);
for(const s of seed.services){lines.push(`insert into impulsetap.services (id,network,name,category,target_type,multi_link,unit,recurring,description,active,min_quantity,max_quantity,delivery,refill) values (${[s.id,s.network,s.name,s.category,s.targetType,s.multiLink,s.unit,s.recurring,s.description,s.active,s.min,s.max,s.delivery,s.refill].map(lit)}) on conflict (id) do nothing;`);for(const p of s.packages)lines.push(`insert into impulsetap.service_packages (id,service_id,quantity,price,badge) values (${[p.id,s.id,p.quantity,p.price,p.badge??''].map(lit)}) on conflict (id) do nothing;`);lines.push(`insert into impulsetap.supplier_services (service_id,supplier_service_id,supplier_cost_per_1000) values (${[s.id,s.supplier_service_id,s.supplier_cost_per_1000].map(lit)}) on conflict (service_id) do nothing;`);}
for(const b of seed.orderBumps)lines.push(`insert into impulsetap.order_bumps (id,main_service_ids,service_id,package_id,price) values (${lit(b.id)},${json(b.mainServiceIds)},${[b.serviceId,b.packageId,b.price].map(lit)}) on conflict (id) do nothing;`);
lines.push('commit;');mkdirSync('supabase',{recursive:true});writeFileSync('supabase/seed.sql',lines.join('\n')+'\n');
