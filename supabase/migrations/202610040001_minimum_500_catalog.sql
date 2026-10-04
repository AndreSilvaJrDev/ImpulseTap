-- Run after 202610020004_custom_quantity_cart.sql.
-- Public social services start at 500, with 100-unit steps.
-- Twitch video views (svc-054) keeps its supplier minimum of 1,000.

update impulsetap.services s
set min_quantity = case when s.id = 'svc-054' then greatest(coalesce(s.min_quantity, 1000), 1000) else 500 end,
    quantity_step = 100
where s.active and s.network <> 'google';

with first_tier as (
  select distinct on (t.service_id) t.service_id, t.unit_size, t.price_per_unit
  from impulsetap.service_price_tiers t
  where t.active
  order by t.service_id, t.min_quantity
)
insert into impulsetap.service_price_tiers
  (service_id, min_quantity, max_quantity, unit_size, price_per_unit, display_order)
select f.service_id, 500, 999, 100,
       greatest(1, round(f.price_per_unit * 100.0 / f.unit_size)::integer), -1
from first_tier f
join impulsetap.services s on s.id = f.service_id
where s.active and s.network <> 'google' and s.id <> 'svc-054'
  and not exists (
    select 1 from impulsetap.service_price_tiers x
    where x.service_id = f.service_id and x.min_quantity = 500
  )
on conflict (service_id, min_quantity) do nothing;

notify pgrst, 'reload schema';
