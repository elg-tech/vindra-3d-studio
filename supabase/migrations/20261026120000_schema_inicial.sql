-- =============================================================
-- Vindra 3D Studio — schema inicial
-- Convenções:
--   * dinheiro em numeric(12,2); custos unitários finos (R$/g, R$/h) em numeric(12,6)
--   * gramas em numeric(10,2); percentuais em numeric(5,2) (10 = 10%)
--   * toda tabela tem owner_id, created_at, updated_at
--   * colunas de taxa/preço podem ser NULL = "ainda não configurado"
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

-- Atualiza updated_at automaticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- Configurações globais (uma linha por dono)
-- -------------------------------------------------------------
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  energy_rate_kwh numeric(12,6),
  labor_hour_rate numeric(12,2),
  failure_margin_pct numeric(5,2) not null default 10 check (failure_margin_pct >= 0 and failure_margin_pct < 100),
  default_margin_pct numeric(5,2) not null default 30 check (default_margin_pct >= 0 and default_margin_pct < 100),
  min_margin_pct numeric(5,2) not null default 15 check (min_margin_pct >= 0 and min_margin_pct < 100),
  tax_pct numeric(5,2) not null default 0 check (tax_pct >= 0 and tax_pct < 100),
  rounding_rule text not null default 'cents_90' check (rounding_rule in ('none', 'cents_90', 'cents_99', 'integer')),
  store_name text not null default 'Vindra 3D',
  store_whatsapp text,
  store_instagram text,
  store_email text,
  store_city text default 'Matão/SP',
  pix_key text,
  default_quote_terms text,
  quote_validity_days integer not null default 7 check (quote_validity_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Impressoras
-- -------------------------------------------------------------
create table public.printers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  model text,
  purchase_price numeric(12,2) check (purchase_price >= 0),
  lifetime_hours numeric(10,2) check (lifetime_hours > 0),
  power_watts numeric(8,2) check (power_watts >= 0),
  maintenance_per_hour numeric(12,6) check (maintenance_per_hour >= 0),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index printers_one_default on public.printers (owner_id) where is_default;

-- -------------------------------------------------------------
-- Canais de venda e suas taxas
-- -------------------------------------------------------------
create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('shopee', 'tiktok', 'direct', 'other')),
  commission_pct numeric(5,2) check (commission_pct >= 0 and commission_pct < 100),
  extra_pct numeric(5,2) check (extra_pct >= 0 and extra_pct < 100),  -- frete grátis/programa, maquininha, Pix
  fixed_fee numeric(12,2) check (fixed_fee >= 0),                     -- taxa fixa por item
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Filamentos
-- -------------------------------------------------------------
create table public.filament_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  empty_spool_weight_g numeric(10,2) check (empty_spool_weight_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.filaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id uuid references public.filament_brands (id) on delete set null,
  material text not null check (material in ('PLA', 'PLA Silk', 'PLA Matte', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro')),
  color_name text not null,
  color_hex text not null default '#888888' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  diameter_mm numeric(4,2) not null default 1.75,
  price_paid numeric(12,2) not null check (price_paid >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  net_weight_g numeric(10,2) not null check (net_weight_g > 0),
  cost_per_gram numeric(12,6) generated always as ((price_paid + shipping_cost) / net_weight_g) stored,
  -- mantido exclusivamente pelos lançamentos em filament_movements
  remaining_g numeric(10,2) not null default 0,
  min_stock_g numeric(10,2) not null default 100 check (min_stock_g >= 0),
  status text not null default 'sealed' check (status in ('sealed', 'in_use', 'empty')),
  purchased_at date,
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filaments_owner_idx on public.filaments (owner_id);

-- -------------------------------------------------------------
-- Insumos reutilizáveis (argola, ímã, parafuso, embalagem...)
-- -------------------------------------------------------------
create table public.supplies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  unit text not null default 'un',
  unit_cost numeric(12,6) not null check (unit_cost >= 0),
  is_packaging boolean not null default false,
  stock_qty numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Fichas de custo (entrada da calculadora)
-- -------------------------------------------------------------
create table public.cost_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  printer_id uuid references public.printers (id) on delete set null,
  print_minutes integer not null default 0 check (print_minutes >= 0),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  post_minutes integer not null default 0 check (post_minutes >= 0),
  purge_g numeric(10,2) not null default 0 check (purge_g >= 0),
  packaging_cost numeric(12,2) not null default 0 check (packaging_cost >= 0),
  quantity integer not null default 1 check (quantity > 0),
  pieces_per_plate integer not null default 1 check (pieces_per_plate > 0),
  -- cache do último cálculo (lib/pricing.ts), para listagens e alertas
  unit_cost numeric(12,4),
  calculated_at timestamptz,
  source_file_path text,  -- .3mf no bucket "files"
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cost_sheet_filaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cost_sheet_id uuid not null references public.cost_sheets (id) on delete cascade,
  -- carretel específico ou, se nulo, custo médio do material
  filament_id uuid references public.filaments (id) on delete set null,
  material text not null,
  color_hex text,
  grams numeric(10,2) not null check (grams >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cost_sheet_supplies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cost_sheet_id uuid not null references public.cost_sheets (id) on delete cascade,
  supply_id uuid references public.supplies (id) on delete set null,
  name text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_cost numeric(12,6) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Produtos
-- -------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  sku text,
  description text,
  image_path text,  -- bucket "product-images"
  model_source text check (model_source in ('own', 'makerworld', 'printables', 'thingiverse', 'purchased', 'other')),
  model_license text,
  model_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, sku)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  sku text,
  cost_sheet_id uuid references public.cost_sheets (id) on delete set null,
  image_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.variant_channel_prices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  channel_id uuid not null references public.sales_channels (id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, channel_id)
);

-- -------------------------------------------------------------
-- Clientes
-- -------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  whatsapp text,
  instagram text,
  email text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_owner_name_idx on public.customers (owner_id, name);

-- -------------------------------------------------------------
-- Orçamentos
-- -------------------------------------------------------------
create table public.document_counters (
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (owner_id, kind, year)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number text not null default '',  -- preenchido pelo trigger assign_quote_number
  -- 32 bytes aleatórios em hex: não adivinhável
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  customer_id uuid references public.customers (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected', 'expired')),
  discount_type text not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  production_days integer check (production_days >= 0),
  valid_until date,
  payment_terms text,
  notes text,
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, number)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  cost_sheet_id uuid references public.cost_sheets (id) on delete set null,
  description text not null,
  image_path text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,4),  -- privado: nunca exposto na página pública
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Numeração VND-AAAA-0001, sequencial por dono e ano (fuso de São Paulo).
create or replace function public.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_next integer;
begin
  if new.number is not null and new.number <> '' then
    return new;
  end if;

  insert into public.document_counters as c (owner_id, kind, year, last_value)
  values (new.owner_id, 'quote', v_year, 1)
  on conflict (owner_id, kind, year) do update set last_value = c.last_value + 1
  returning c.last_value into v_next;

  new.number := format('VND-%s-%s', v_year, lpad(v_next::text, 4, '0'));
  return new;
end;
$$;

-- -------------------------------------------------------------
-- Pedidos / produção
-- -------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  channel_id uuid references public.sales_channels (id) on delete set null,
  platform_order_number text,
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment', 'queued', 'printing', 'post_processing', 'ready', 'shipped', 'delivered', 'cancelled'
  )),
  board_position integer not null default 0,
  due_date date,
  tracking_code text,
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  channel_fees numeric(12,2) not null default 0 check (channel_fees >= 0),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_owner_status_idx on public.orders (owner_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  cost_sheet_id uuid references public.cost_sheets (id) on delete set null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,4),
  print_minutes integer check (print_minutes >= 0),  -- tempo total do item, para a fila
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.print_failures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  filament_id uuid references public.filaments (id) on delete set null,
  grams_lost numeric(10,2) not null default 0 check (grams_lost >= 0),
  minutes_lost integer not null default 0 check (minutes_lost >= 0),
  cost numeric(12,2) not null default 0 check (cost >= 0),
  reason text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Movimentações de filamento (fonte da verdade do peso restante)
-- grams positivo = entrada, negativo = saída
-- -------------------------------------------------------------
create table public.filament_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  filament_id uuid not null references public.filaments (id) on delete cascade,
  kind text not null check (kind in ('purchase', 'consumption', 'adjustment', 'failure')),
  grams numeric(10,2) not null,
  order_id uuid references public.orders (id) on delete set null,
  print_failure_id uuid references public.print_failures (id) on delete set null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filament_movements_filament_idx on public.filament_movements (filament_id, occurred_at desc);

-- Aplica cada movimentação no saldo do carretel e ajusta o status.
create or replace function public.apply_filament_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_delta numeric(10,2);
begin
  if tg_op = 'INSERT' then
    v_delta := new.grams;
  elsif tg_op = 'DELETE' then
    v_delta := -old.grams;
  else
    v_delta := new.grams - old.grams;
  end if;

  update public.filaments f
  set remaining_g = greatest(f.remaining_g + v_delta, 0),
      status = case
        when f.remaining_g + v_delta <= 0 then 'empty'
        when f.status = 'sealed' and v_delta < 0 then 'in_use'
        when f.status = 'empty' and f.remaining_g + v_delta > 0 then 'in_use'
        else f.status
      end
  where f.id = coalesce(new.filament_id, old.filament_id);

  return null;
end;
$$;

-- Ao cadastrar um carretel, lança a entrada com o peso líquido.
create or replace function public.register_filament_purchase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.filament_movements (owner_id, filament_id, kind, grams, occurred_at, notes)
  values (new.owner_id, new.id, 'purchase', new.net_weight_g,
          coalesce(new.purchased_at::timestamptz, now()), 'Entrada do carretel');
  return null;
end;
$$;

-- -------------------------------------------------------------
-- Financeiro
-- -------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  category text not null,
  description text,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),  -- taxas de canal (receitas)
  occurred_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  is_fixed boolean not null default false,  -- despesa fixa mensal (ponto de equilíbrio)
  order_id uuid references public.orders (id) on delete set null,
  filament_id uuid references public.filaments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_owner_date_idx on public.transactions (owner_id, occurred_on);

-- -------------------------------------------------------------
-- Triggers
-- -------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'printers', 'sales_channels', 'filament_brands', 'filaments', 'supplies',
    'cost_sheets', 'cost_sheet_filaments', 'cost_sheet_supplies', 'products', 'product_variants',
    'variant_channel_prices', 'customers', 'quotes', 'quote_items', 'orders', 'order_items',
    'print_failures', 'filament_movements', 'transactions'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

create trigger assign_quote_number
  before insert on public.quotes
  for each row execute function public.assign_quote_number();

create trigger apply_filament_movement
  after insert or update of grams or delete on public.filament_movements
  for each row execute function public.apply_filament_movement();

create trigger register_filament_purchase
  after insert on public.filaments
  for each row execute function public.register_filament_purchase();
