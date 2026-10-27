-- =============================================================
-- Fase 9: financeiro e dashboard.
--   1. order_items.unit_labor_cost: parte do custo por peça que é hora de trabalho
--      (DRE "Lucro líquido sem a sua hora"). Pedidos existentes preenchidos pela ficha.
--   2. transactions: só lançamentos manuais, com categorias conhecidas.
--      Receitas (pagamentos) e compras de carretel são montadas na hora, sem cópia.
--   3. create_order grava a mão de obra do item.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Mão de obra no item do pedido
-- -------------------------------------------------------------
alter table public.order_items
  add column unit_labor_cost numeric(12,4) check (unit_labor_cost >= 0);

-- Mesma conta de lib/pricing.ts: (preparo do lote + pós × peças) ÷ 60 × hora, por peça,
-- com o acréscimo da margem de falha (o custo por peça também o tem).
update public.order_items oi
set unit_labor_cost = round(
  ((cs.prep_minutes + cs.post_minutes * cs.quantity) / 60.0 * s.labor_hour_rate / cs.quantity)
    * (1 + s.failure_margin_pct / 100),
  4
)
from public.cost_sheets cs
join public.settings s on s.owner_id = cs.owner_id
where oi.cost_sheet_id = cs.id
  and s.labor_hour_rate is not null;

-- -------------------------------------------------------------
-- 2. Lançamentos manuais
-- -------------------------------------------------------------
alter table public.transactions
  add constraint transactions_category_check check (
    (kind = 'expense' and category in ('parts', 'tools', 'packaging', 'ads', 'software', 'shipping', 'taxes', 'refund', 'other'))
    or (kind = 'income' and category = 'other_income')
  ),
  add constraint transactions_amount_positive check (gross_amount > 0),
  add constraint transactions_fixed_expense check (not is_fixed or kind = 'expense');

-- -------------------------------------------------------------
-- 3. create_order com a mão de obra do item
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
    order_id, variant_id, cost_sheet_id, description, quantity, unit_price, unit_cost, unit_labor_cost, print_minutes
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
    nullif(i->>'printMinutes', '')::integer
  from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(i);

  insert into public.order_payments (order_id, kind, amount)
  select v_id, p->>'kind', (p->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_order->'payments', '[]'::jsonb)) as t(p);

  return v_id;
end;
$$;

revoke all on function public.create_order(jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
