-- =============================================================
-- Calculadora: produção x venda, e kits no catálogo. Só aditiva.
--   1. Ficha: tempo de separar/embalar/enviar por pedido, lista de kits da calculadora e
--      insumo por pedido (etiqueta) x por peça (ímã, parafuso).
--      packaging_cost passa a valer por pedido (kit); quantity, "peças produzidas" (divide o preparo).
--      Com kit = 1 e os padrões abaixo, o custo das fichas existentes não muda (exceto a margem de
--      falha, que deixa de incidir sobre a embalagem: decisão do Enzo, 03/11/2026).
--   2. Variação com "peças por kit" (padrão 1); itens de orçamento e pedido guardam uma cópia.
--   3. save_cost_sheet, save_product, save_quote e create_order gravam os campos novos.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Colunas
-- -------------------------------------------------------------
alter table public.cost_sheets
  add column pack_minutes integer not null default 0 check (pack_minutes >= 0 and pack_minutes <= 100000),
  add column kit_sizes integer[] not null default '{1}' check (
    cardinality(kit_sizes) between 1 and 10 and 1 <= all (kit_sizes) and 1000 >= all (kit_sizes)
  );

alter table public.cost_sheet_supplies
  add column per_order boolean not null default false;

alter table public.product_variants
  add column pieces_per_kit integer not null default 1 check (pieces_per_kit between 1 and 1000);

alter table public.quote_items
  add column pieces_per_kit integer not null default 1 check (pieces_per_kit between 1 and 1000);

alter table public.order_items
  add column pieces_per_kit integer not null default 1 check (pieces_per_kit between 1 and 1000);

-- -------------------------------------------------------------
-- 2. save_cost_sheet com tempo de embalar, kits e insumo por pedido
-- -------------------------------------------------------------
create or replace function public.save_cost_sheet(p_sheet jsonb, p_unit_cost numeric)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_sheet->>'id', '')::uuid;
  v_kits integer[] := coalesce(
    (select array_agg(k::integer) from jsonb_array_elements_text(p_sheet->'kitSizes') as k),
    '{1}'
  );
begin
  if v_id is null then
    insert into public.cost_sheets (
      name, printer_id, print_minutes, prep_minutes, post_minutes, purge_g, packaging_cost,
      quantity, pieces_per_plate, pack_minutes, kit_sizes, unit_cost, calculated_at, source_file_path, notes
    )
    values (
      p_sheet->>'name',
      nullif(p_sheet->>'printerId', '')::uuid,
      (p_sheet->>'printMinutes')::integer,
      (p_sheet->>'prepMinutes')::integer,
      (p_sheet->>'postMinutes')::integer,
      (p_sheet->>'purgeG')::numeric,
      (p_sheet->>'packagingCost')::numeric,
      (p_sheet->>'quantity')::integer,
      (p_sheet->>'piecesPerPlate')::integer,
      coalesce((p_sheet->>'packMinutes')::integer, 0),
      v_kits,
      p_unit_cost,
      now(),
      nullif(p_sheet->>'sourceFilePath', ''),
      nullif(p_sheet->>'notes', '')
    )
    returning id into v_id;
  else
    update public.cost_sheets set
      name = p_sheet->>'name',
      printer_id = nullif(p_sheet->>'printerId', '')::uuid,
      print_minutes = (p_sheet->>'printMinutes')::integer,
      prep_minutes = (p_sheet->>'prepMinutes')::integer,
      post_minutes = (p_sheet->>'postMinutes')::integer,
      purge_g = (p_sheet->>'purgeG')::numeric,
      packaging_cost = (p_sheet->>'packagingCost')::numeric,
      quantity = (p_sheet->>'quantity')::integer,
      pieces_per_plate = (p_sheet->>'piecesPerPlate')::integer,
      pack_minutes = coalesce((p_sheet->>'packMinutes')::integer, 0),
      kit_sizes = v_kits,
      unit_cost = p_unit_cost,
      calculated_at = now(),
      source_file_path = coalesce(nullif(p_sheet->>'sourceFilePath', ''), source_file_path),
      notes = nullif(p_sheet->>'notes', '')
    where id = v_id;

    if not found then
      raise exception 'cost_sheet_not_found' using errcode = 'P0002';
    end if;

    delete from public.cost_sheet_filaments where cost_sheet_id = v_id;
    delete from public.cost_sheet_supplies where cost_sheet_id = v_id;
  end if;

  insert into public.cost_sheet_filaments (cost_sheet_id, filament_id, material, color_hex, grams, sort_order)
  select
    v_id,
    nullif(f->>'filamentId', '')::uuid,
    f->>'material',
    nullif(f->>'colorHex', ''),
    (f->>'grams')::numeric,
    (t.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_sheet->'filaments', '[]'::jsonb)) with ordinality as t(f, ord);

  insert into public.cost_sheet_supplies (cost_sheet_id, supply_id, name, quantity, unit_cost, per_order)
  select
    v_id,
    nullif(e->>'supplyId', '')::uuid,
    e->>'name',
    (e->>'quantity')::numeric,
    (e->>'unitCost')::numeric,
    coalesce((e->>'perOrder')::boolean, false)
  from jsonb_array_elements(coalesce(p_sheet->'extras', '[]'::jsonb)) as t(e);

  return v_id;
end;
$$;

revoke all on function public.save_cost_sheet(jsonb, numeric) from public, anon;
grant execute on function public.save_cost_sheet(jsonb, numeric) to authenticated;

-- -------------------------------------------------------------
-- 3. save_product com peças por kit
-- -------------------------------------------------------------
create or replace function public.save_product(p_product jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_product->>'id', '')::uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_keep uuid[] := '{}';
  v_ord integer;
begin
  if v_id is null then
    insert into public.products (name, sku, description, image_path, model_source, model_license, model_url, active)
    values (
      p_product->>'name',
      p_product->>'sku',
      nullif(p_product->>'description', ''),
      nullif(p_product->>'imagePath', ''),
      nullif(p_product->>'modelSource', ''),
      nullif(p_product->>'modelLicense', ''),
      nullif(p_product->>'modelUrl', ''),
      coalesce((p_product->>'active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.products set
      name = p_product->>'name',
      sku = p_product->>'sku',
      description = nullif(p_product->>'description', ''),
      image_path = nullif(p_product->>'imagePath', ''),
      model_source = nullif(p_product->>'modelSource', ''),
      model_license = nullif(p_product->>'modelLicense', ''),
      model_url = nullif(p_product->>'modelUrl', ''),
      active = coalesce((p_product->>'active')::boolean, true)
    where id = v_id;

    if not found then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;

  -- variações removidas saem antes, para liberar SKUs reaproveitados nas que ficam
  select coalesce(array_agg(nullif(x->>'id', '')::uuid) filter (where nullif(x->>'id', '') is not null), '{}')
    into v_keep
    from jsonb_array_elements(coalesce(p_product->'variants', '[]'::jsonb)) as x;
  delete from public.product_variants where product_id = v_id and not (id = any (v_keep));

  for v_variant, v_ord in
    select x, t.ord from jsonb_array_elements(coalesce(p_product->'variants', '[]'::jsonb)) with ordinality as t(x, ord)
  loop
    v_variant_id := nullif(v_variant->>'id', '')::uuid;
    if v_variant_id is null then
      insert into public.product_variants (product_id, name, sku, cost_sheet_id, image_path, active, sort_order, pieces_per_kit)
      values (
        v_id,
        v_variant->>'name',
        v_variant->>'sku',
        nullif(v_variant->>'costSheetId', '')::uuid,
        nullif(v_variant->>'imagePath', ''),
        coalesce((v_variant->>'active')::boolean, true),
        (v_ord - 1)::integer,
        coalesce((v_variant->>'piecesPerKit')::integer, 1)
      )
      returning id into v_variant_id;
    else
      update public.product_variants set
        name = v_variant->>'name',
        sku = v_variant->>'sku',
        cost_sheet_id = nullif(v_variant->>'costSheetId', '')::uuid,
        image_path = nullif(v_variant->>'imagePath', ''),
        active = coalesce((v_variant->>'active')::boolean, true),
        sort_order = (v_ord - 1)::integer,
        pieces_per_kit = coalesce((v_variant->>'piecesPerKit')::integer, 1)
      where id = v_variant_id and product_id = v_id;

      if not found then
        raise exception 'variant_not_found' using errcode = 'P0002';
      end if;
    end if;

    delete from public.variant_channel_prices where variant_id = v_variant_id;
    insert into public.variant_channel_prices (variant_id, channel_id, price)
    select v_variant_id, (p->>'channelId')::uuid, (p->>'price')::numeric
    from jsonb_array_elements(coalesce(v_variant->'prices', '[]'::jsonb)) as p
    where nullif(p->>'price', '') is not null;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_product(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 4a. save_quote com peças por kit no item
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
    unit_labor_cost, cost_source, cost_input, pieces_per_kit, sort_order
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
    coalesce(nullif(i->>'piecesPerKit', '')::integer, 1),
    (t.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_quote->'items', '[]'::jsonb)) with ordinality as t(i, ord);

  return v_id;
end;
$$;

revoke all on function public.save_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 4b. create_order com peças por kit no item
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
    print_minutes, cost_source, cost_input, pieces_per_kit
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
    case when jsonb_typeof(i->'costInput') = 'object' then i->'costInput' end,
    coalesce(nullif(i->>'piecesPerKit', '')::integer, 1)
  from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(i);

  insert into public.order_payments (order_id, kind, amount)
  select v_id, p->>'kind', (p->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_order->'payments', '[]'::jsonb)) as t(p);

  return v_id;
end;
$$;

revoke all on function public.create_order(jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
