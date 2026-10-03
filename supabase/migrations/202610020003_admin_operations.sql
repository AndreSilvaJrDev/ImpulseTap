-- Phase A. Append-only migration; no public access to business tables.
alter table impulsetap.orders add column version integer not null default 1;
alter table impulsetap.orders add column gateway_fee integer check(gateway_fee>=0);
alter table impulsetap.orders add column refunded_amount integer not null default 0 check(refunded_amount>=0);
alter table impulsetap.orders add constraint refund_limit check(refunded_amount<=total);
alter table impulsetap.orders add column access_hash text;
alter table impulsetap.orders add column request_key uuid unique;
alter table impulsetap.orders drop constraint orders_payment_status_check;
alter table impulsetap.orders add constraint orders_payment_status_check check(payment_status in ('pending','paid','expired','failed','refunded','partially_refunded'));
alter table impulsetap.orders drop constraint orders_fulfillment_status_check;
alter table impulsetap.orders add constraint orders_fulfillment_status_check check(fulfillment_status in ('awaiting_payment','paid','awaiting_processing','processing','submitted_to_supplier','in_progress','partial','completed','supplier_error','cancelled','refunded'));
alter table impulsetap.order_items add column supplier_service_id_snapshot text;
alter table impulsetap.order_items add column supplier_name_snapshot text;
alter table impulsetap.order_items add column network_name_snapshot text;
alter table impulsetap.order_items add column supplier_order_id text;
alter table impulsetap.order_items add column submitted_at timestamptz;
alter table impulsetap.order_items add column links jsonb not null default '[]';
create table impulsetap.order_status_history (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references impulsetap.orders(id),
 actor uuid references auth.users(id), event text not null, old_status text, new_status text,
 created_at timestamptz not null default now()
);
create table impulsetap.admin_notes (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references impulsetap.orders(id),
 author uuid not null references auth.users(id),body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now()
);
create table impulsetap.audit_logs (
 id uuid primary key default gen_random_uuid(),actor uuid references auth.users(id),entity text not null,
 entity_id text not null,action text not null,changes jsonb not null default '{}',created_at timestamptz not null default now()
);
create table impulsetap.admin_notifications (
 id uuid primary key default gen_random_uuid(),order_id uuid references impulsetap.orders(id),
 title text not null,created_at timestamptz not null default now()
);
alter table impulsetap.order_status_history enable row level security;
alter table impulsetap.admin_notes enable row level security;
alter table impulsetap.audit_logs enable row level security;
alter table impulsetap.admin_notifications enable row level security;
revoke all on all tables in schema impulsetap from public,anon,authenticated;
create index on impulsetap.orders(created_at desc,id);
create index on impulsetap.order_items(order_id);
create index on impulsetap.order_status_history(order_id,created_at);
create index on impulsetap.admin_notes(order_id,created_at);

create function public.impulsetap_admin_identity() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform impulsetap.assert_admin();
 return jsonb_build_object('id',auth.uid(),'role','admin');
end $$;

-- Gross profit is unknown until all costs and gateway fees have been recorded.
-- total is already net of discounts: never subtract discount for a second time.
create view impulsetap.order_finance as
select o.*,c.cost, case when c.cost is not null and o.gateway_fee is not null
 then o.total-o.refunded_amount-o.gateway_fee-c.cost else null end as gross_profit
from impulsetap.orders o left join lateral (
 select case when count(*)>0 and count(provider_cost_snapshot)=count(*)
 then round(sum(provider_cost_snapshot)*100)::bigint else null end cost
 from impulsetap.order_items where order_id=o.id
) c on true;
revoke all on impulsetap.order_finance from public,anon,authenticated;

create function public.impulsetap_admin_orders(p_filter jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;v_page integer:=greatest(1,least(coalesce((p_filter->>'page')::integer,1),100000));
begin
 perform impulsetap.assert_admin();
 with filtered as (
 select o.* from impulsetap.order_finance o
 where (coalesce(p_filter->>'q','')='' or concat_ws(' ',o.public_id,o.customer_name,o.customer_email,o.customer_phone) ilike '%'||left(p_filter->>'q',200)||'%')
 and (coalesce(p_filter->>'payment','')='' or o.payment_status=p_filter->>'payment')
 and (coalesce(p_filter->>'delivery','')='' or o.fulfillment_status=p_filter->>'delivery')
 and (coalesce(p_filter->>'from','')='' or o.created_at >= (p_filter->>'from')::timestamptz)
 and (coalesce(p_filter->>'to','')='' or o.created_at < (p_filter->>'to')::timestamptz)
 and (coalesce(p_filter->>'network','')='' or exists(select 1 from impulsetap.order_items i where i.order_id=o.id and i.network=p_filter->>'network'))
 and (coalesce(p_filter->>'service','')='' or exists(select 1 from impulsetap.order_items i where i.order_id=o.id and i.service_name ilike '%'||left(p_filter->>'service',200)||'%'))
 and (coalesce(p_filter->>'supplier','')='' or exists(select 1 from impulsetap.order_items i where i.order_id=o.id and i.supplier_name_snapshot ilike '%'||left(p_filter->>'supplier',200)||'%'))
 ), paged as (select * from filtered order by created_at desc,id limit 25 offset (v_page-1)*25)
 select jsonb_build_object('total',(select count(*) from filtered),'page',v_page,'rows',coalesce((select jsonb_agg((to_jsonb(o)-'access_hash'-'request_key')||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from impulsetap.order_items i where i.order_id=o.id)) order by o.created_at desc,o.id) from paged o),'[]')) into result;
 return result;
end $$;

create function public.impulsetap_admin_order(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform impulsetap.assert_admin();
 select (to_jsonb(o)-'access_hash'-'request_key')||jsonb_build_object(
 'items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from impulsetap.order_items i where i.order_id=o.id),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'provider',p.provider,'txid',p.txid,'status',p.status,'amount',p.amount,'created_at',p.created_at,'paid_at',p.paid_at,'expires_at',p.expires_at) order by p.created_at),'[]') from impulsetap.payments p where p.order_id=o.id),
 'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at),'[]') from impulsetap.order_status_history h where h.order_id=o.id),
 'notes',(select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at),'[]') from impulsetap.admin_notes n where n.order_id=o.id),
 'customer_summary',(select jsonb_build_object('orders',count(*),'spent',coalesce(sum(total-refunded_amount) filter(where paid_at is not null),0),'first_order',min(created_at)) from impulsetap.orders c where lower(c.customer_email)=lower(o.customer_email))
 ) into result from impulsetap.order_finance o where o.id=p_id;
 if result is null then raise exception using errcode='IT404',message='Order not found';end if;
 return result;
end $$;

create function public.impulsetap_admin_dashboard(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Sao_Paulo')::date;result jsonb;
begin
 perform impulsetap.assert_admin();
 if p_days not in (7,30) then raise exception using errcode='IT422',message='Invalid period';end if;
 with daily as (
 select d.day::date as day,count(o.id) orders,
 coalesce(sum(o.total-o.refunded_amount) filter(where o.paid_at is not null),0) revenue,
 case when count(o.id) filter(where o.paid_at is not null and o.gross_profit is null)>0 then null
 else coalesce(sum(o.gross_profit) filter(where o.paid_at is not null),0) end profit,
 count(o.id) filter(where o.paid_at is not null) paid_count
 from generate_series(today-30,today,'1 day'::interval) d(day)
 left join impulsetap.order_finance o on (o.created_at at time zone 'America/Sao_Paulo')::date=d.day::date
 group by d.day
 ) select jsonb_build_object(
 'today',(select to_jsonb(d) from daily d where day=today),
 'yesterday',(select to_jsonb(d) from daily d where day=today-1),
 'series',(select jsonb_agg(to_jsonb(d) order by day) from daily d where day>today-p_days),
 'pending',(select count(*) from impulsetap.orders where payment_status='pending'),
 'awaiting',(select count(*) from impulsetap.orders where payment_status='paid' and fulfillment_status in ('paid','awaiting_processing')),
 'in_progress',(select count(*) from impulsetap.orders where fulfillment_status in ('processing','submitted_to_supplier','in_progress')),
 'problems',(select count(*) from impulsetap.orders where fulfillment_status in ('partial','supplier_error')),
 'stalled',(select count(*) from impulsetap.orders where fulfillment_status in ('processing','submitted_to_supplier','in_progress') and updated_at<now()-interval '24 hours'),
 'networks',(select coalesce(jsonb_agg(to_jsonb(n)),'[]') from (select i.network,sum(i.sale_price) revenue from impulsetap.order_items i join impulsetap.orders o on o.id=i.order_id where o.paid_at is not null and o.refunded_amount=0 and o.created_at >= ((today-p_days+1)::timestamp at time zone 'America/Sao_Paulo') group by i.network order by revenue desc)n),
 'notifications',(select coalesce(jsonb_agg(to_jsonb(n)),'[]') from (select * from impulsetap.admin_notifications order by created_at desc limit 10)n)
 ) into result;
 return result;
end $$;

create function public.impulsetap_admin_order_action(p_id uuid,p_version integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare o impulsetap.orders;next_status text;event_text text;amount integer; item impulsetap.order_items;
begin
 perform impulsetap.assert_admin();
 select * into o from impulsetap.orders where id=p_id for update;
 if not found then raise exception using errcode='IT404',message='Order not found';end if;
 if o.version<>p_version then raise exception using errcode='IT409',message='Version conflict';end if;
 if p_action='note' then
  insert into impulsetap.admin_notes(order_id,author,body) values(p_id,auth.uid(),trim(p_data->>'note'));
  event_text='Nota interna adicionada';
 elsif p_action='finance' then
  if not(p_data ? 'gateway_fee') or (p_data->>'gateway_fee')::numeric<0 or (p_data->>'gateway_fee')::numeric<>trunc((p_data->>'gateway_fee')::numeric) then raise exception using errcode='IT422',message='Invalid fee';end if;
  update impulsetap.orders set gateway_fee=(p_data->>'gateway_fee')::integer where id=p_id;
  event_text='Taxa do gateway registrada';
 elsif p_action='manual_paid' then
  if o.payment_status not in ('pending','expired','failed') or o.fulfillment_status='cancelled' or p_data->>'confirmation' is distinct from o.public_id or length(trim(coalesce(p_data->>'reason','')))<10 then raise exception using errcode='IT422',message='Payment confirmation required';end if;
  if exists(select 1 from impulsetap.payments where order_id=p_id and status='pending' and (expires_at is null or expires_at>now())) then raise exception using errcode='IT422',message='Resolve active PIX before manual payment';end if;
  insert into impulsetap.payments(order_id,provider,provider_payment_id,amount,status,paid_at,provider_raw_status) values(p_id,'manual',gen_random_uuid()::text,o.total,'paid',now(),'ADMIN_VERIFIED');
  update impulsetap.orders set payment_status='paid',paid_at=now(),fulfillment_status='awaiting_processing' where id=p_id;
  event_text='Pagamento confirmado manualmente pelo administrador';next_status='awaiting_processing';
 elsif p_action='refund' then
  amount:=(p_data->>'amount')::integer;
  if o.payment_status not in ('paid','partially_refunded') or p_data->>'confirmation' is distinct from o.public_id or length(trim(coalesce(p_data->>'reason','')))<10 or amount is null or amount<=0 or amount+o.refunded_amount>o.total then raise exception using errcode='IT422',message='Invalid refund record';end if;
  update impulsetap.orders set refunded_amount=refunded_amount+amount,payment_status=case when refunded_amount+amount=total then 'refunded' else 'partially_refunded' end,fulfillment_status=case when refunded_amount+amount=total then 'refunded' else fulfillment_status end where id=p_id;
  event_text='Reembolso externo registrado (não executa transferência)';
 elsif p_action='submit' then
  if o.payment_status<>'paid' or o.fulfillment_status not in ('awaiting_processing','processing','partial','supplier_error') then raise exception using errcode='IT422',message='Paid order required';end if;
  select * into item from impulsetap.order_items where id=(p_data->>'item_id')::uuid and order_id=p_id for update;
  if not found or item.supplier_order_id is not null or length(trim(coalesce(p_data->>'supplier_order_id',''))) not between 1 and 100 or length(trim(coalesce(p_data->>'supplier_name',''))) not between 1 and 100 then raise exception using errcode='IT422',message='Supplier order already sent or invalid';end if;
  update impulsetap.order_items set supplier_order_id=trim(p_data->>'supplier_order_id'),supplier_name_snapshot=trim(p_data->>'supplier_name'),submitted_at=now(),status='submitted_to_supplier' where id=item.id;
  next_status:=case when exists(select 1 from impulsetap.order_items where order_id=p_id and supplier_order_id is null) then 'processing' else 'submitted_to_supplier' end;
  update impulsetap.orders set fulfillment_status=next_status where id=p_id;
  event_text='Envio manual ao fornecedor registrado';
 elsif p_action='status' then
  next_status:=p_data->>'status';
  if next_status in ('cancelled','completed') and p_data->>'confirmation' is distinct from o.public_id then raise exception using errcode='IT422',message='Confirmation required';end if;
  if next_status='cancelled' then
   if o.fulfillment_status not in ('awaiting_payment','awaiting_processing','paid','supplier_error') or exists(select 1 from impulsetap.order_items where order_id=p_id and supplier_order_id is not null) or exists(select 1 from impulsetap.payments where order_id=p_id and status='pending' and (expires_at is null or expires_at>now())) then raise exception using errcode='IT422',message='Cannot cancel this order';end if;
  else
   if o.payment_status<>'paid' or not (
    (o.fulfillment_status in ('paid','awaiting_processing') and next_status='processing') or
    (o.fulfillment_status='processing' and next_status='supplier_error') or
    (o.fulfillment_status='submitted_to_supplier' and next_status in ('in_progress','supplier_error')) or
    (o.fulfillment_status='in_progress' and next_status in ('partial','completed','supplier_error')) or
    (o.fulfillment_status='partial' and next_status in ('in_progress','completed','supplier_error')) or
    (o.fulfillment_status='supplier_error' and next_status='processing')
   ) then raise exception using errcode='IT422',message='Invalid transition';end if;
  end if;
  update impulsetap.orders set fulfillment_status=next_status where id=p_id;
  event_text='Status de entrega atualizado';
 else raise exception using errcode='IT422',message='Unknown action';
 end if;
 update impulsetap.orders set version=version+1,updated_at=now() where id=p_id;
 insert into impulsetap.order_status_history(order_id,actor,event,old_status,new_status) values(p_id,auth.uid(),event_text,o.fulfillment_status,next_status);
 insert into impulsetap.audit_logs(actor,entity,entity_id,action,changes) values(auth.uid(),'order',p_id::text,p_action,jsonb_build_object('before',jsonb_build_object('payment',o.payment_status,'delivery',o.fulfillment_status,'version',o.version),'data',p_data));
 if p_action not in ('note','finance') then insert into impulsetap.admin_notifications(order_id,title) values(p_id,event_text||' · '||o.public_id);end if;
 return public.impulsetap_admin_order(p_id);
end $$;

-- Server only. Atomically creates order and immutable item snapshots from catalog.
create function public.impulsetap_create_order(p_request uuid,p_access_hash text,p_customer jsonb,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare oid uuid;item jsonb;pkg impulsetap.service_packages;s impulsetap.services;net impulsetap.social_networks;cost numeric; sid text;price integer;b impulsetap.order_bumps;total_price integer:=0;created boolean:=false;
begin
 if length(p_access_hash)<>64 or jsonb_array_length(p_items) not between 1 and 2 or length(trim(coalesce(p_customer->>'name','')))<2 or length(coalesce(p_customer->>'email',''))<3 or p_customer->>'terms' is distinct from 'true' then raise exception using errcode='IT422',message='Invalid checkout';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select id into oid from impulsetap.orders where request_key=p_request and access_hash=p_access_hash;
 if oid is not null then return (select jsonb_build_object('id',id,'public_id',public_id,'total',total) from impulsetap.orders where id=oid);end if;
 -- Serialize the per-customer limit across application instances.
 perform pg_advisory_xact_lock(hashtextextended(lower(p_customer->>'email'),1));
 if (select count(*) from impulsetap.orders where customer_email=lower(p_customer->>'email') and created_at>now()-interval '1 hour')>=10 then
  raise exception using errcode='IT429',message='Checkout rate limit';
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into pkg from impulsetap.service_packages where id=item->>'package_id' for share;
  select * into s from impulsetap.services where id=pkg.service_id for share;
  select * into net from impulsetap.social_networks where id=s.network for share;
  if pkg.id is null or not s.active or not net.active or (s.min_quantity is not null and pkg.quantity<s.min_quantity) or (s.max_quantity is not null and pkg.quantity>s.max_quantity) or coalesce(jsonb_array_length(item->'links'),0) not between 1 and 10 or (not s.multi_link and jsonb_array_length(item->'links')<>1) then raise exception using errcode='IT422',message='Unavailable package';end if;
  if (select sum((l->>'quantity')::integer) from jsonb_array_elements(item->'links') l)<>pkg.quantity or exists(select 1 from jsonb_array_elements(item->'links') l where (l->>'quantity')::numeric<>trunc((l->>'quantity')::numeric) or (l->>'quantity')::integer<=0 or length(trim(coalesce(l->>'url',''))) not between 3 and 2048) then raise exception using errcode='IT422',message='Invalid distribution';end if;
  price:=pkg.price;
  if created then
   select * into b from impulsetap.order_bumps where id=item->>'bump_id' and package_id=pkg.id and service_id=s.id and main_service_ids ? (select service_id from impulsetap.order_items where order_id=oid limit 1);
   if not found then raise exception using errcode='IT422',message='Invalid order bump';end if;price:=b.price;
  else
   insert into impulsetap.orders(public_id,customer_name,customer_email,customer_phone,subtotal,total,request_key,access_hash) values('IT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),trim(p_customer->>'name'),lower(p_customer->>'email'),p_customer->>'phone',price,price,p_request,p_access_hash) returning id into oid;created:=true;
  end if;
  select supplier_cost_per_1000,supplier_service_id into cost,sid from impulsetap.supplier_services where service_id=s.id;
  insert into impulsetap.order_items(order_id,service_id,package_id,network,network_name_snapshot,service_name,quantity,unit,sale_price,provider_cost_snapshot,supplier_service_id_snapshot,target,links)
  values(oid,s.id,pkg.id,s.network,net.name,s.name,pkg.quantity,s.unit,price,round(cost*pkg.quantity/1000,2),sid,item->'links'->0->>'url',item->'links');
  total_price:=total_price+price;
 end loop;
 update impulsetap.orders set subtotal=total_price,total=total_price where id=oid;
 insert into impulsetap.order_status_history(order_id,event,new_status) values(oid,'Pedido criado','awaiting_payment');
 insert into impulsetap.admin_notifications(order_id,title) values(oid,'Novo pedido');
 return (select jsonb_build_object('id',id,'public_id',public_id,'total',total) from impulsetap.orders where id=oid);
end $$;

create function public.impulsetap_customer_order(p_code text,p_access_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('public_id',o.public_id,'total',o.total,'created_at',o.created_at,'payment_status',o.payment_status,
 'status',case when o.fulfillment_status='supplier_error' then 'processing' when o.fulfillment_status='submitted_to_supplier' then 'processing' else o.fulfillment_status end,
 'items',(select jsonb_agg(jsonb_build_object('name',i.service_name,'quantity',i.quantity,'unit',i.unit,'network',i.network)) from impulsetap.order_items i where i.order_id=o.id))
 from impulsetap.orders o where o.public_id=p_code and o.access_hash=p_access_hash
$$;
revoke all on function public.impulsetap_admin_identity(),public.impulsetap_admin_orders(jsonb),public.impulsetap_admin_order(uuid),public.impulsetap_admin_dashboard(integer),public.impulsetap_admin_order_action(uuid,integer,text,jsonb),public.impulsetap_create_order(uuid,text,jsonb,jsonb),public.impulsetap_customer_order(text,text) from public,anon,authenticated;
grant execute on function public.impulsetap_admin_identity(),public.impulsetap_admin_orders(jsonb),public.impulsetap_admin_order(uuid),public.impulsetap_admin_dashboard(integer),public.impulsetap_admin_order_action(uuid,integer,text,jsonb) to authenticated;
grant execute on function public.impulsetap_create_order(uuid,text,jsonb,jsonb),public.impulsetap_customer_order(text,text) to service_role;
