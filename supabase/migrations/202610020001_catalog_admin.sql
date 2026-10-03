-- Catalog and supplier metadata. This migration requires Supabase Auth.
-- Private schema is intentionally NOT exposed through PostgREST.
create schema if not exists impulsetap;
revoke all on schema impulsetap from public, anon, authenticated;
create table impulsetap.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table impulsetap.social_networks (
 id text primary key,name text not null,description text not null,color text not null,
 hosts jsonb not null check(jsonb_typeof(hosts)='array'),active boolean not null default false,
 version integer not null default 1
);
create table impulsetap.services (
 id text primary key,network text not null references impulsetap.social_networks(id),
 name text not null,category text not null,target_type text not null check(target_type in ('profile','post','video','channel','track','business')),
 multi_link boolean not null default false,unit text not null,recurring boolean not null default false,
 description text not null,active boolean not null default false,
 min_quantity integer check(min_quantity>0),max_quantity integer check(max_quantity>0),
 delivery text not null default '' check(length(delivery)<=500),refill text not null default '' check(length(refill)<=500),
 version integer not null default 1,check(max_quantity is null or min_quantity is null or max_quantity>=min_quantity)
);
create table impulsetap.service_packages (
 id text primary key,service_id text not null references impulsetap.services(id),
 quantity integer not null check(quantity>0),price integer not null check(price>0),
 badge text not null default '' check(length(badge)<=40),unique(service_id,quantity)
);
create table impulsetap.supplier_services (
 service_id text primary key references impulsetap.services(id),
 supplier_service_id text check(length(supplier_service_id)<=100),
 supplier_cost_per_1000 numeric(14,2) check(supplier_cost_per_1000>=0 and supplier_cost_per_1000<>'NaN'::numeric)
);
create table impulsetap.order_bumps (
 id text primary key,main_service_ids jsonb not null,service_id text not null references impulsetap.services(id),
 package_id text not null references impulsetap.service_packages(id),price integer not null check(price>0)
);
alter table impulsetap.admin_users enable row level security;
alter table impulsetap.social_networks enable row level security;
alter table impulsetap.services enable row level security;
alter table impulsetap.service_packages enable row level security;
alter table impulsetap.supplier_services enable row level security;
alter table impulsetap.order_bumps enable row level security;
revoke all on all tables in schema impulsetap from public,anon,authenticated;

create function impulsetap.assert_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from impulsetap.admin_users where user_id=auth.uid()) then
  raise exception using errcode='42501',message='Admin access required';
 end if;
end $$;

create function impulsetap.service_public_json(p_id text,p_only_available boolean default true) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',s.id,'network',s.network,'name',s.name,'category',s.category,'targetType',s.target_type,
 'multiLink',s.multi_link,'unit',s.unit,'recurring',s.recurring,'description',s.description,'active',s.active,
 'min',s.min_quantity,'max',s.max_quantity,'delivery',s.delivery,'refill',s.refill,'version',s.version,
 'packages',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',p.id,'quantity',p.quantity,'price',p.price,'badge',nullif(p.badge,''))) order by p.quantity)
 from impulsetap.service_packages p where p.service_id=s.id and (not p_only_available or ((s.min_quantity is null or p.quantity>=s.min_quantity) and (s.max_quantity is null or p.quantity<=s.max_quantity)))),'[]'::jsonb))
 from impulsetap.services s where s.id=p_id
$$;

-- Anonymous API exposes only an explicit public projection. No supplier join is permitted here.
create function public.impulsetap_public_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 with available as (
 select s.id,s.network from impulsetap.services s join impulsetap.social_networks n on n.id=s.network
 where n.active and s.active and exists(select 1 from impulsetap.service_packages p where p.service_id=s.id and (s.min_quantity is null or p.quantity>=s.min_quantity) and (s.max_quantity is null or p.quantity<=s.max_quantity))
 )
 select jsonb_build_object(
 'source','database',
 'networks',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from impulsetap.social_networks n where n.active and exists(select 1 from available a where a.network=n.id)),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(impulsetap.service_public_json(a.id) order by a.id) from available a),'[]'::jsonb),
 'orderBumps',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'mainServiceIds',b.main_service_ids,'serviceId',b.service_id,'packageId',b.package_id,'price',b.price)) from impulsetap.order_bumps b join impulsetap.service_packages p on p.id=b.package_id join impulsetap.services s on s.id=p.service_id where b.service_id in (select id from available) and (s.min_quantity is null or p.quantity>=s.min_quantity) and (s.max_quantity is null or p.quantity<=s.max_quantity)),'[]'::jsonb))
$$;

create function public.impulsetap_admin_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform impulsetap.assert_admin();
 return jsonb_build_object(
 'networks',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from impulsetap.social_networks n),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(impulsetap.service_public_json(s.id,false)||jsonb_build_object('supplier_service_id',ss.supplier_service_id,'supplier_cost_per_1000',ss.supplier_cost_per_1000) order by s.id)
 from impulsetap.services s left join impulsetap.supplier_services ss on ss.service_id=s.id),'[]'::jsonb));
end $$;

create function public.impulsetap_update_network(p_id text,p_active boolean,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform impulsetap.assert_admin();
 if p_active is null then raise exception using errcode='IT422',message='Invalid active flag';end if;
 update impulsetap.social_networks set active=p_active,version=version+1 where id=p_id and version=p_version;
 if not found then raise exception using errcode='IT409',message='Version conflict';end if;
end $$;

create function public.impulsetap_update_service(p_id text,p_version integer,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s impulsetap.services; p jsonb; v_min integer;v_max integer;v_cost numeric;v_active boolean;
begin
 perform impulsetap.assert_admin();
 select * into s from impulsetap.services where id=p_id for update;
 if not found or s.version<>p_version then raise exception using errcode='IT409',message='Version conflict';end if;
 if jsonb_typeof(p_data->'active') is distinct from 'boolean' or jsonb_typeof(p_data->'packages') is distinct from 'array' or coalesce(jsonb_typeof(p_data->'supplier_cost_per_1000'),'null') not in ('null','number') or coalesce(jsonb_typeof(p_data->'min'),'null') not in ('null','number') or coalesce(jsonb_typeof(p_data->'max'),'null') not in ('null','number') then
  raise exception using errcode='IT422',message='Invalid service fields';
 end if;
 v_active=(p_data->>'active')::boolean;v_min=(p_data->>'min')::integer;v_max=(p_data->>'max')::integer;v_cost=(p_data->>'supplier_cost_per_1000')::numeric;
 if (v_min is not null and v_min<=0) or (v_max is not null and v_max<=0) or (v_min is not null and v_max is not null and v_max<v_min) or (v_cost is not null and (v_cost<0 or v_cost<>round(v_cost,2))) then
  raise exception using errcode='IT422',message='Invalid limits or cost';
 end if;
 if jsonb_array_length(p_data->'packages')<>(select count(*) from impulsetap.service_packages where service_id=p_id) or
 (select count(distinct x->>'id') from jsonb_array_elements(p_data->'packages') x)<>jsonb_array_length(p_data->'packages') then
  raise exception using errcode='IT422',message='Package set must match service';
 end if;
 for p in select value from jsonb_array_elements(p_data->'packages') loop
  if jsonb_typeof(p->'price') is distinct from 'number' or (p->>'price')::numeric<=0 or (p->>'price')::numeric<>trunc((p->>'price')::numeric) then
   raise exception using errcode='IT422',message='Price must use integer cents';
  end if;
  update impulsetap.service_packages set price=(p->>'price')::integer,badge=coalesce(p->>'badge','') where id=p->>'id' and service_id=p_id;
  if not found then raise exception using errcode='IT422',message='Unknown package';end if;
 end loop;
 if v_active and not exists(select 1 from impulsetap.service_packages where service_id=p_id and (v_min is null or quantity>=v_min) and (v_max is null or quantity<=v_max)) then
  raise exception using errcode='IT422',message='Active services require an available package';
 end if;
 update impulsetap.services set active=v_active,min_quantity=v_min,max_quantity=v_max,delivery=coalesce(p_data->>'delivery',''),refill=coalesce(p_data->>'refill',''),version=version+1 where id=p_id;
 insert into impulsetap.supplier_services(service_id,supplier_service_id,supplier_cost_per_1000)
 values(p_id,nullif(trim(p_data->>'supplier_service_id'),''),v_cost)
 on conflict(service_id) do update set supplier_service_id=excluded.supplier_service_id,supplier_cost_per_1000=excluded.supplier_cost_per_1000;
 -- No external requests, supplier submission or fulfillment side effects.
end $$;

revoke all on all functions in schema impulsetap from public,anon,authenticated;
revoke all on function public.impulsetap_public_catalog() from public,anon,authenticated;
revoke all on function public.impulsetap_admin_catalog() from public,anon,authenticated;
revoke all on function public.impulsetap_update_network(text,boolean,integer) from public,anon,authenticated;
revoke all on function public.impulsetap_update_service(text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.impulsetap_public_catalog() to anon,authenticated;
grant execute on function public.impulsetap_admin_catalog() to authenticated;
grant execute on function public.impulsetap_update_network(text,boolean,integer) to authenticated;
grant execute on function public.impulsetap_update_service(text,integer,jsonb) to authenticated;
