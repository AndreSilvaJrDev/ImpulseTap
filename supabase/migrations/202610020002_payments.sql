-- PIX checkout persistence. All writes happen through server routes using the
-- service role; these tables are never exposed to anon/authenticated clients.
create table if not exists impulsetap.orders (
 id uuid primary key default gen_random_uuid(),
 public_id text not null unique,
 customer_name text not null,
 customer_email text not null,
 customer_phone text,
 subtotal integer not null check(subtotal>0),
 discount integer not null default 0 check(discount>=0),
 total integer not null check(total>0),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','expired','refunded','failed')),
 fulfillment_status text not null default 'awaiting_payment' check(fulfillment_status in ('awaiting_payment','awaiting_processing','processing','in_progress','partial','completed','cancelled','refunded')),
 utm jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists impulsetap.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references impulsetap.orders(id) on delete cascade,
 service_id text not null, package_id text not null, network text not null, service_name text not null,
 quantity integer not null check(quantity>0), unit text not null, sale_price integer not null check(sale_price>0),
 provider_cost_snapshot numeric(14,2), target text not null, status text not null default 'pending'
);
create table if not exists impulsetap.payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references impulsetap.orders(id) on delete cascade,
 provider text not null, provider_payment_id text, txid text, amount integer not null check(amount>0),
 status text not null default 'pending' check(status in ('pending','paid','expired','refunded','failed')),
 pix_copy_paste text, qr_code_payload text, qr_code_data text, created_at timestamptz not null default now(),
 expires_at timestamptz, paid_at timestamptz, provider_raw_status text, unique(provider,provider_payment_id), unique(provider,txid)
);
create table if not exists impulsetap.payment_events (
 id uuid primary key default gen_random_uuid(), payment_id uuid references impulsetap.payments(id) on delete cascade,
 provider text not null, event_id text not null, event_type text not null, payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), unique(provider,event_id)
);
create index if not exists orders_email_created_idx on impulsetap.orders(customer_email,created_at desc);
create index if not exists payments_txid_idx on impulsetap.payments(txid);
alter table impulsetap.orders enable row level security;
alter table impulsetap.order_items enable row level security;
alter table impulsetap.payments enable row level security;
alter table impulsetap.payment_events enable row level security;
revoke all on impulsetap.orders,impulsetap.order_items,impulsetap.payments,impulsetap.payment_events from public,anon,authenticated;
