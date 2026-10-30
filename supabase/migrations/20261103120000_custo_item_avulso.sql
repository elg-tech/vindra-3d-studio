-- =============================================================
-- Custo no item avulso (orçamento e pedido). Só aditiva.
--   1. Colunas novas nos itens: origem do custo (mini calculadora ou manual) e o que foi digitado,
--      para reabrir a edição e para a previsão da baixa de filamento. Privadas: a página pública do
--      orçamento só expõe descrição, imagem, quantidade e preço.
--   2. save_quote e create_order gravam os campos novos (e a mão de obra do item do orçamento).
--   3. set_order_item_cost: define o custo de um item avulso de um pedido existente, em qualquer
--      status. Só mexe no custo do item: nunca em preço, quantidade, pagamentos, taxas ou total.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Colunas
-- cost_source: 'calc' (mini calculadora) ou 'manual'; nulo = custo da ficha ou sem custo.
-- -------------------------------------------------------------
alter table public.quote_items
  add column unit_labor_cost numeric(12,4) check (unit_labor_cost >= 0),
  add column cost_source text check (cost_source in ('calc', 'manual')),
  add column cost_input jsonb check (cost_input is null or jsonb_typeof(cost_input) = 'object');

alter table public.order_items
  add column cost_source text check (cost_source in ('calc', 'manual')),
  add column cost_input jsonb check (cost_input is null or jsonb_typeof(cost_input) = 'object');

-- -------------------------------------------------------------
-- 2a. save_quote com o custo do item avulso
-- -------------------------------------------------------------
create or replace function public.save_quote(p_quote jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_quote->>'id', '')::uuid;
  v_customer uuid := nullif(p_quote->>'customerId', '')::uuid;
  v_status text;
begin
  -- cliente rápido (nome + WhatsApp) criado junto
  if v_customer is null and nullif(btrim(p_quote->'newCustomer'->>'name'), '') is not null then
    insert into public.customers (name, whatsapp)
    values (btrim(p_quote->'newCustomer'->>'name'), nullif(p_quote->'newCustomer'->>'whatsapp', ''))
    returning id into v_customer;
  end if;

  if v_id is null then
    insert into public.quotes (
      customer_id, discount_type, discount_value, shipping_cost, production_days, valid_until,
      deposit_pct, payment_terms, notes
    )
    values (
      v_customer,
      p_quote->>'discountType',
      (p_quote->>'discountValue')::numeric,
      (p_quote->>'shippingCost')::numeric,
      nullif(p_quote->>'productionDays', '')::integer,
      nullif(p_quote->>'validUntil', '')::date,
      nullif(p_quote->>'depositPct', '')::numeric,
      nullif(p_quote->>'paymentTerms', ''),
      nullif(p_quote->>'notes', '')
    )
    returning id into v_id;
  else
    select status into v_status from public.quotes where id = v_id for update;
    if not found then
      raise exception 'quote_not_found' using errcode = 'P0002';
    end if;
    if v_status in ('approved', 'rejected') then
      raise exception 'quote_locked' using errcode = 'P0001';
    end if;

    update public.quotes set
      customer_id = v_customer,
      discount_type = p_quote->>'discountType',
      discount_value = (p_quote->>'discountValue')::numeric,
      shipping_cost = (p_quote->>'shippingCost')::numeric,
      production_days = nullif(p_quote->>'productionDays', '')::integer,
      valid_until = nullif(p_quote->>'validUntil', '')::date,
      deposit_pct = nullif(p_quote->>'depositPct', '')::numeric,
      payment_terms = nullif(p_quote->>'paymentTerms', ''),
      notes = nullif(p_quote->>'notes', ''),
      revision = revision + 1,
      revised_at = now()
    where id = v_id;

    delete from public.quote_items where quote_id = v_id;
  end if;

  insert into public.quote_items (
    quote_id, variant_id, cost_sheet_id, description, image_path, quantity, unit_price, unit_cost,
    unit_labor_cost, cost_source, cost_input, sort_order
  )
  select
    v_id,
    nullif(i->>'variantId', '')::uuid,
    nullif(i->>'costSheetId', '')::uuid,
    i->>'description',
    nullif(i->>'imagePath', ''),
    (i->>'quantity')::integer,
    (i->>'unitPrice')::numeric,
    nullif(i->>'unitCost', '')::numeric,
    nullif(i->>'unitLaborCost', '')::numeric,
    nullif(i->>'costSource', ''),
    case when jsonb_typeof(i->'costInput') = 'object' then i->'costInput' end,
    (t.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_quote->'items', '[]'::jsonb)) with ordinality as t(i, ord);

  return v_id;
end;
$$;

revoke all on function public.save_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 2b. create_order com a origem do custo do item avulso
-- -------------------------------------------------------------
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
    order_id, variant_id, cost_sheet_id, description, quantity, unit_price, unit_cost, unit_labor_cost,
    print_minutes, cost_source, cost_input
  )
  select
    v_id,
    nullif(i->>'variantId', '')::uuid,
    nullif(i->>'costSheetId', '')::uuid,
    i->>'description',
    (i->>'quantity')::integer,
    (i->>'unitPrice')::numeric,
    nullif(i->>'unitCost', '')::numeric,
    nullif(i->>'unitLaborCost', '')::numeric,
    nullif(i->>'printMinutes', '')::integer,
    nullif(i->>'costSource', ''),
    case when jsonb_typeof(i->'costInput') = 'object' then i->'costInput' end
  from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(i);

  insert into public.order_payments (order_id, kind, amount)
  select v_id, p->>'kind', (p->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_order->'payments', '[]'::jsonb)) as t(p);

  return v_id;
end;
$$;

revoke all on function public.create_order(jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 3. Definir o custo de um item avulso (sem variação) de um pedido existente
-- security invoker + owner_id = auth.uid(): outro usuário não acha o item.
-- p_cost_sheet_id: ficha criada pelo "Salvar como ficha" (tem de ser do mesmo dono).
-- -------------------------------------------------------------
create or replace function public.set_order_item_cost(
  p_item_id uuid,
  p_unit_cost numeric,
  p_unit_labor_cost numeric,
  p_cost_source text,
  p_cost_input jsonb,
  p_cost_sheet_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'invalid_cost' using errcode = 'P0001';
  end if;
  if p_unit_labor_cost is not null and (p_unit_labor_cost < 0 or p_unit_labor_cost > coalesce(p_unit_cost, 0)) then
    raise exception 'invalid_labor_cost' using errcode = 'P0001';
  end if;
  if p_cost_sheet_id is not null
     and not exists (select 1 from public.cost_sheets where id = p_cost_sheet_id and owner_id = auth.uid()) then
    raise exception 'cost_sheet_not_found' using errcode = 'P0002';
  end if;

  update public.order_items set
    unit_cost = p_unit_cost,
    unit_labor_cost = p_unit_labor_cost,
    cost_source = p_cost_source,
    cost_input = p_cost_input,
    cost_sheet_id = p_cost_sheet_id
  where id = p_item_id
    and owner_id = auth.uid()
    and variant_id is null;

  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_order_item_cost(uuid, numeric, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.set_order_item_cost(uuid, numeric, numeric, text, jsonb, uuid) to authenticated;
