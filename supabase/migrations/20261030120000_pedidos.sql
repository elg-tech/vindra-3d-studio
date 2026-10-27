-- =============================================================
-- Fase 8: pedidos (kanban), pagamentos em partes, baixa de filamento e falhas.
--   1. Pedido: número PED-AAAA-0001, controle de baixa, entrada na coluna, pago na plataforma.
--   2. order_payments: sinal e restante (ou pagamento único), cada um com data e forma.
--   3. Funções: create_order, consume_order_filament, record_print_failure, cancel_order.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Pedido
-- -------------------------------------------------------------
alter table public.orders
  add column number text not null default '',  -- preenchido pelo trigger assign_order_number
  -- filamento baixado (impede baixa dupla) ou movido de propósito sem baixa
  add column consumed_at timestamptz,
  add column filament_skipped boolean not null default false,
  -- quando entrou na coluna atual: a fila desconta o tempo já impresso em "Imprimindo"
  add column status_changed_at timestamptz not null default now(),
  -- Shopee/TikTok: a plataforma recebe do cliente; não há sinal nem restante
  add column paid_by_platform boolean not null default false;

create unique index orders_owner_number_idx on public.orders (owner_id, number) where number <> '';
-- um orçamento vira no máximo um pedido
create unique index orders_quote_idx on public.orders (quote_id) where quote_id is not null;
create index orders_customer_idx on public.orders (customer_id);

-- Numeração PED-AAAA-0001, sequencial por dono e ano (fuso de São Paulo).
create or replace function public.assign_order_number()
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
  values (new.owner_id, 'order', v_year, 1)
  on conflict (owner_id, kind, year) do update set last_value = c.last_value + 1
  returning c.last_value into v_next;

  new.number := format('PED-%s-%s', v_year, lpad(v_next::text, 4, '0'));
  return new;
end;
$$;

create trigger assign_order_number
  before insert on public.orders
  for each row execute function public.assign_order_number();

create or replace function public.touch_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger touch_order_status
  before update of status on public.orders
  for each row execute function public.touch_order_status();

revoke all on function public.assign_order_number() from public, anon, authenticated;
revoke all on function public.touch_order_status() from public, anon, authenticated;

-- -------------------------------------------------------------
-- 2. Pagamentos do pedido
-- -------------------------------------------------------------
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  -- deposit = sinal, balance = restante, full = pagamento único
  kind text not null check (kind in ('deposit', 'balance', 'full')),
  amount numeric(12,2) not null check (amount >= 0),
  paid_on date,  -- null = ainda não pago
  method text check (method in ('pix', 'cash', 'card')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, kind),
  check ((paid_on is null) = (method is null))
);
create index order_payments_owner_paid_idx on public.order_payments (owner_id, paid_on);

alter table public.order_payments enable row level security;
create policy "dono gerencia" on public.order_payments for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.order_payments
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- 3. Funções (security invoker: rodam com o RLS de quem chama)
-- -------------------------------------------------------------

-- Cria o pedido com itens e pagamentos previstos numa transação só.
-- Do orçamento: só aprovado, e uma vez (quote_not_approved | quote_already_converted).
create or replace function public.create_order(p_order jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_quote uuid := nullif(p_order->>'quoteId', '')::uuid;
  v_quote_status text;
begin
  if v_quote is not null then
    select status into v_quote_status from public.quotes where id = v_quote;
    if v_quote_status is distinct from 'approved' then
      raise exception 'quote_not_approved' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.orders where quote_id = v_quote) then
      raise exception 'quote_already_converted' using errcode = 'P0001';
    end if;
  end if;

  insert into public.orders (
    quote_id, customer_id, channel_id, platform_order_number, status, due_date,
    shipping_cost, discount_amount, total_amount, channel_fees, paid_by_platform, paid_at, notes
  )
  values (
    v_quote,
    nullif(p_order->>'customerId', '')::uuid,
    nullif(p_order->>'channelId', '')::uuid,
    nullif(p_order->>'platformOrderNumber', ''),
    p_order->>'status',
    nullif(p_order->>'dueDate', '')::date,
    (p_order->>'shippingCost')::numeric,
    (p_order->>'discountAmount')::numeric,
    (p_order->>'totalAmount')::numeric,
    (p_order->>'channelFees')::numeric,
    coalesce((p_order->>'paidByPlatform')::boolean, false),
    case when coalesce((p_order->>'paidByPlatform')::boolean, false) then now() end,
    nullif(p_order->>'notes', '')
  )
  returning id into v_id;

  insert into public.order_items (
    order_id, variant_id, cost_sheet_id, description, quantity, unit_price, unit_cost, print_minutes
  )
  select
    v_id,
    nullif(i->>'variantId', '')::uuid,
    nullif(i->>'costSheetId', '')::uuid,
    i->>'description',
    (i->>'quantity')::integer,
    (i->>'unitPrice')::numeric,
    nullif(i->>'unitCost', '')::numeric,
    nullif(i->>'printMinutes', '')::integer
  from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(i);

  insert into public.order_payments (order_id, kind, amount)
  select v_id, p->>'kind', (p->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_order->'payments', '[]'::jsonb)) as t(p);

  return v_id;
end;
$$;

-- Baixa do filamento do pedido, uma vez só (already_consumed).
-- p_skip = true: "Mover sem baixar" (peça que já estava pronta, por exemplo).
-- Cada linha: { filamentId, grams } com gramas positivos; a saída é gravada negativa.
create or replace function public.consume_order_filament(p_order_id uuid, p_lines jsonb, p_skip boolean default false)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.consumed_at is not null or v_order.filament_skipped then
    raise exception 'already_consumed' using errcode = 'P0001';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'order_cancelled' using errcode = 'P0001';
  end if;

  if p_skip then
    update public.orders set filament_skipped = true where id = p_order_id;
    return;
  end if;

  insert into public.filament_movements (filament_id, kind, grams, order_id, notes)
  select
    (l->>'filamentId')::uuid,
    'consumption',
    -abs((l->>'grams')::numeric),
    p_order_id,
    format('Pedido %s', v_order.number)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as t(l)
  where nullif(l->>'filamentId', '') is not null and (l->>'grams')::numeric > 0;

  update public.orders set consumed_at = now() where id = p_order_id;
end;
$$;

-- Falha de impressão: registro + perda no carretel juntos. O custo vem calculado do servidor.
create or replace function public.record_print_failure(p_order_id uuid, p_failure jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_number text;
  v_filament uuid := nullif(p_failure->>'filamentId', '')::uuid;
  v_grams numeric := coalesce((p_failure->>'grams')::numeric, 0);
begin
  select number into v_number from public.orders where id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  insert into public.print_failures (order_id, filament_id, grams_lost, minutes_lost, cost, reason)
  values (
    p_order_id,
    v_filament,
    v_grams,
    coalesce((p_failure->>'minutes')::integer, 0),
    coalesce((p_failure->>'cost')::numeric, 0),
    nullif(p_failure->>'reason', '')
  )
  returning id into v_id;

  if v_filament is not null and v_grams > 0 then
    insert into public.filament_movements (filament_id, kind, grams, order_id, print_failure_id, notes)
    values (v_filament, 'failure', -v_grams, p_order_id, v_id, format('Falha no pedido %s', v_number));
  end if;

  return v_id;
end;
$$;

-- Cancelar. Peças não impressas (p_printed = false): o filamento baixado volta ao carretel.
-- Peças impressas: a baixa fica (as peças são perda). Perdas por falha nunca voltam.
create or replace function public.cancel_order(p_order_id uuid, p_printed boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'already_cancelled' using errcode = 'P0001';
  end if;

  if not p_printed then
    -- apagar a saída devolve o saldo (trigger apply_filament_movement)
    delete from public.filament_movements where order_id = p_order_id and kind = 'consumption';
    update public.orders set consumed_at = null where id = p_order_id;
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;
end;
$$;

revoke all on function public.create_order(jsonb) from public, anon;
revoke all on function public.consume_order_filament(uuid, jsonb, boolean) from public, anon;
revoke all on function public.record_print_failure(uuid, jsonb) from public, anon;
revoke all on function public.cancel_order(uuid, boolean) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.consume_order_filament(uuid, jsonb, boolean) to authenticated;
grant execute on function public.record_print_failure(uuid, jsonb) to authenticated;
grant execute on function public.cancel_order(uuid, boolean) to authenticated;
