-- Custom quantities and server-owned pricing tiers. Legacy packages remain for
-- old orders and admin compatibility; new checkout can use these tiers.
alter table impulsetap.services add column if not exists quantity_step integer not null default 100 check(quantity_step>0);
alter table impulsetap.order_items add column if not exists quantity_step_snapshot integer;
alter table impulsetap.order_items add column if not exists unit_size_snapshot integer;
alter table impulsetap.order_items add column if not exists unit_price_snapshot integer;
alter table impulsetap.order_items add column if not exists pricing_tier_snapshot jsonb;
create table if not exists impulsetap.service_price_tiers(
 id uuid primary key default gen_random_uuid(), service_id text not null references impulsetap.services(id) on delete cascade,
 min_quantity integer not null check(min_quantity>0), max_quantity integer check(max_quantity is null or max_quantity>=min_quantity),
 unit_size integer not null check(unit_size>0), price_per_unit integer not null check(price_per_unit>0),
 discount_percent numeric(6,2), active boolean not null default true, display_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(service_id,min_quantity)
);
alter table impulsetap.service_price_tiers enable row level security;
revoke all on impulsetap.service_price_tiers from public,anon,authenticated;
create index if not exists service_price_tiers_lookup on impulsetap.service_price_tiers(service_id,min_quantity,active);

-- Bootstrap tiers from the existing package prices, then replace selected active
-- services with the new public price table below. Existing package rows remain.
insert into impulsetap.service_price_tiers(service_id,min_quantity,max_quantity,unit_size,price_per_unit,display_order)
select p.service_id,p.quantity,lead(p.quantity) over(partition by p.service_id order by p.quantity)-1,1000,
 round(p.price/(p.quantity/1000.0))::integer,row_number() over(partition by p.service_id order by p.quantity)-1
from impulsetap.service_packages p
on conflict(service_id,min_quantity) do nothing;
update impulsetap.services set quantity_step=100 where active;
update impulsetap.services set min_quantity=100 where active and min_quantity is null or min_quantity>=1000;

create or replace function impulsetap.service_public_json(p_id text,p_only_available boolean default true) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',s.id,'network',s.network,'name',s.name,'category',s.category,'targetType',s.target_type,
 'multiLink',s.multi_link,'unit',s.unit,'recurring',s.recurring,'description',s.description,'active',s.active,
 'min',s.min_quantity,'max',s.max_quantity,'quantityStep',s.quantity_step,'delivery',s.delivery,'refill',s.refill,'version',s.version,
 'tiers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'minQuantity',t.min_quantity,'maxQuantity',t.max_quantity,'unitSize',t.unit_size,'pricePerUnit',t.price_per_unit,'discountPercent',t.discount_percent,'active',t.active,'displayOrder',t.display_order) order by t.display_order)
  from impulsetap.service_price_tiers t where t.service_id=s.id and (not p_only_available or t.active)),'[]'::jsonb),
 'packages',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',p.id,'quantity',p.quantity,'price',p.price,'badge',nullif(p.badge,''))) order by p.quantity)
  from impulsetap.service_packages p where p.service_id=s.id and (not p_only_available or ((s.min_quantity is null or p.quantity>=s.min_quantity) and (s.max_quantity is null or p.quantity<=s.max_quantity)))),'[]'::jsonb))
 from impulsetap.services s where s.id=p_id
$$;

create or replace function public.impulsetap_public_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 with available as (select s.id,s.network from impulsetap.services s join impulsetap.social_networks n on n.id=s.network where n.active and s.active and exists(select 1 from impulsetap.service_price_tiers t where t.service_id=s.id and t.active))
 select jsonb_build_object('source','database','networks',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from impulsetap.social_networks n where n.active and exists(select 1 from available a where a.network=n.id)),'[]'::jsonb),'services',coalesce((select jsonb_agg(impulsetap.service_public_json(a.id) order by a.id) from available a),'[]'::jsonb),'orderBumps','[]'::jsonb)
$$;
revoke all on function public.impulsetap_public_catalog() from public,anon,authenticated;
grant execute on function public.impulsetap_public_catalog() to anon,authenticated;

-- Custom checkout entry point. It accepts service and quantity only; all prices,
-- tiers, supplier data and package foreign keys are resolved in this transaction.
create function public.impulsetap_create_custom_order(p_request uuid,p_access_hash text,p_customer jsonb,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare oid uuid;item jsonb;s impulsetap.services;n impulsetap.social_networks;t impulsetap.service_price_tiers;q integer;price integer;cost numeric;sid text;links jsonb;target text;total_price integer:=0;first_package text;
begin
 if length(p_access_hash)<>64 or jsonb_array_length(p_items) not between 1 and 20 or length(trim(coalesce(p_customer->>'name','')))<2 or length(coalesce(p_customer->>'email',''))<3 or p_customer->>'terms' is distinct from 'true' then raise exception using errcode='IT422',message='Invalid checkout';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select id into oid from impulsetap.orders where request_key=p_request and access_hash=p_access_hash;
 if oid is not null then return (select jsonb_build_object('id',id,'public_id',public_id,'total',total) from impulsetap.orders where id=oid);end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_customer->>'email'),1));
 if (select count(*) from impulsetap.orders where customer_email=lower(p_customer->>'email') and created_at>now()-interval '1 hour')>=10 then raise exception using errcode='IT429',message='Checkout rate limit';end if;
 insert into impulsetap.orders(public_id,customer_name,customer_email,customer_phone,subtotal,total,request_key,access_hash) values('IT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),trim(p_customer->>'name'),lower(p_customer->>'email'),p_customer->>'phone',1,1,p_request,p_access_hash) returning id into oid;
 for item in select value from jsonb_array_elements(p_items) loop
  q:=(item->>'quantity')::integer;links:=item->'links';
  select * into s from impulsetap.services where id=item->>'service_id';select * into n from impulsetap.social_networks where id=s.network;
  if not found or not s.active or not n.active or q is null or q<s.min_quantity or (s.max_quantity is not null and q>s.max_quantity) or mod(q-s.min_quantity,s.quantity_step)<>0 or jsonb_array_length(links) not between 1 and 10 then raise exception using errcode='IT422',message='Invalid service or quantity';end if;
  if (select sum((l->>'quantity')::integer) from jsonb_array_elements(links) l)<>q then raise exception using errcode='IT422',message='Invalid distribution';end if;
  select * into t from impulsetap.service_price_tiers where service_id=s.id and active and q>=min_quantity and (max_quantity is null or q<=max_quantity) order by display_order limit 1;
  if not found then raise exception using errcode='IT422',message='Quantity tier unavailable';end if;
  price:=ceil(q::numeric/t.unit_size)*t.price_per_unit;select supplier_cost_per_1000,supplier_service_id into cost,sid from impulsetap.supplier_services where service_id=s.id;select id into first_package from impulsetap.service_packages where service_id=s.id order by quantity limit 1;target:=links->0->>'url';
  insert into impulsetap.order_items(order_id,service_id,package_id,network,network_name_snapshot,service_name,quantity,unit,sale_price,provider_cost_snapshot,supplier_service_id_snapshot,target,links,quantity_step_snapshot,unit_size_snapshot,unit_price_snapshot,pricing_tier_snapshot)
  values(oid,s.id,first_package,s.network,n.name,s.name,q,s.unit,price,round(cost*q/1000,2),sid,target,links,s.quantity_step,t.unit_size,t.price_per_unit,to_jsonb(t));total_price:=total_price+price;
 end loop;
 update impulsetap.orders set subtotal=total_price,total=total_price where id=oid;insert into impulsetap.order_status_history(order_id,event,new_status) values(oid,'Pedido criado','awaiting_payment');insert into impulsetap.admin_notifications(order_id,title) values(oid,'Novo pedido');
 return (select jsonb_build_object('id',id,'public_id',public_id,'total',total) from impulsetap.orders where id=oid);
end $$;
revoke all on function public.impulsetap_create_custom_order(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.impulsetap_create_custom_order(uuid,text,jsonb,jsonb) to service_role;
