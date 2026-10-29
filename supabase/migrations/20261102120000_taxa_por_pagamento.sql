-- =============================================================
-- Taxa por forma de pagamento na Venda direta.
-- Só aditiva: colunas novas, check de forma de pagamento ampliado e uma função.
-- As colunas antigas (commission_pct, extra_pct, fixed_fee) continuam; a Venda direta deixa de lê-las.
-- =============================================================

-- Taxas por forma de pagamento (usadas só pelo canal de Venda direta).
alter table public.sales_channels
  add column pix_pct numeric(5,2) not null default 0 check (pix_pct >= 0 and pix_pct < 100),
  add column pix_fixed numeric(12,2) not null default 0 check (pix_fixed >= 0),
  add column cash_pct numeric(5,2) not null default 0 check (cash_pct >= 0 and cash_pct < 100),
  add column cash_fixed numeric(12,2) not null default 0 check (cash_fixed >= 0),
  add column debit_pct numeric(5,2) not null default 0 check (debit_pct >= 0 and debit_pct < 100),
  add column debit_fixed numeric(12,2) not null default 0 check (debit_fixed >= 0),
  add column credit_pct numeric(5,2) not null default 0 check (credit_pct >= 0 and credit_pct < 100),
  add column credit_fixed numeric(12,2) not null default 0 check (credit_fixed >= 0);

-- A taxa única "Maquininha/Pix" de hoje vira a de débito e a de crédito; Pix e Dinheiro ficam em 0.
update public.sales_channels
set debit_pct = coalesce(extra_pct, 0),
    credit_pct = coalesce(extra_pct, 0),
    debit_fixed = coalesce(fixed_fee, 0),
    credit_fixed = coalesce(fixed_fee, 0)
where kind = 'direct';

-- Forma de pagamento: cartão passa a ser débito ou crédito. 'card' continua aceito nos registros antigos.
do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.order_payments'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%method%''card''%';
  if v_name is not null then
    execute format('alter table public.order_payments drop constraint %I', v_name);
  end if;
end;
$$;
alter table public.order_payments
  add constraint order_payments_method_check check (method in ('pix', 'cash', 'debit', 'credit', 'card'));

-- Taxa cobrada naquele pagamento (calculada no servidor ao marcar como pago, pela forma usada).
-- null = não pago, pagamento de outro canal ou registro anterior a esta migração.
alter table public.order_payments
  add column fee_amount numeric(12,2) check (fee_amount >= 0);

-- Marca ou desmarca um pagamento com a taxa dele. Na Venda direta, a taxa do pedido passa a ser a soma das taxas
-- dos pagamentos recebidos (o lucro, o DRE e o dashboard leem orders.channel_fees). Roda com o RLS de quem chama.
create or replace function public.set_order_payment(
  p_order_id uuid,
  p_kind text,
  p_paid_on date,
  p_method text,
  p_fee numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_direct boolean;
begin
  update public.order_payments
  set paid_on = p_paid_on,
      method = case when p_paid_on is null then null else p_method end,
      fee_amount = case when p_paid_on is null then null else p_fee end
  where order_id = p_order_id and kind = p_kind;
  if not found then
    raise exception 'payment_not_found';
  end if;

  select coalesce(c.kind = 'direct', false) into v_direct
  from public.orders o
  left join public.sales_channels c on c.id = o.channel_id
  where o.id = p_order_id;

  if v_direct then
    update public.orders
    set channel_fees = coalesce(
      (select sum(p.fee_amount) from public.order_payments p where p.order_id = p_order_id and p.paid_on is not null),
      0
    )
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.set_order_payment(uuid, text, date, text, numeric) from public, anon;
grant execute on function public.set_order_payment(uuid, text, date, text, numeric) to authenticated;
