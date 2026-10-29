-- =============================================================
-- PRÉVIA da correção das taxas dos pagamentos de Venda direta. SOMENTE LEITURA (só SELECT).
-- Rodar no Supabase → SQL Editor DEPOIS de:
--   1. aplicar a migração 20261102120000_taxa_por_pagamento (npm run db:push);
--   2. conferir as taxas por forma em Configurações → Canais → Venda direta.
-- Troque SEU_EMAIL_AQUI pelo e-mail com que você entra no app (o SQL Editor enxerga todas as contas).
-- Copie o resultado e mande para o Claude: ele gera os UPDATEs por id para você revisar e rodar.
-- =============================================================
with pagamentos as (
  select
    o.id as order_id,
    o.number,
    o.channel_fees,
    p.id as payment_id,
    p.kind,
    p.amount,
    p.method,
    p.paid_on,
    p.fee_amount,
    sum(p.amount) over (partition by o.id) as total_pagamentos,
    c.pix_pct, c.pix_fixed, c.cash_pct, c.cash_fixed,
    c.debit_pct, c.debit_fixed, c.credit_pct, c.credit_fixed
  from public.orders o
  join public.sales_channels c on c.id = o.channel_id and c.kind = 'direct'
  join public.order_payments p on p.order_id = o.id
  where o.paid_by_platform = false
    and o.owner_id = (select id from auth.users where email = 'SEU_EMAIL_AQUI')
)
select
  number as pedido,
  case kind when 'deposit' then 'Sinal' when 'balance' then 'Restante' else 'Pagamento' end as pagamento,
  amount as valor,
  coalesce(method, '(não pago)') as forma,
  paid_on as pago_em,
  -- o que o Financeiro mostra hoje: a taxa do pedido dividida na proporção do valor
  round(channel_fees * amount / nullif(total_pagamentos, 0), 2) as taxa_atual,
  case
    when paid_on is null then null
    when method = 'pix' then least(round(amount * pix_pct / 100 + pix_fixed, 2), amount)
    when method = 'cash' then least(round(amount * cash_pct / 100 + cash_fixed, 2), amount)
    when method = 'debit' then least(round(amount * debit_pct / 100 + debit_fixed, 2), amount)
    when method = 'credit' then least(round(amount * credit_pct / 100 + credit_fixed, 2), amount)
  end as taxa_nova,
  case
    when method = 'card' then 'PERGUNTAR: débito ou crédito?'
    when paid_on is null then 'não pago: fica sem taxa até ser marcado'
  end as observacao,
  payment_id,
  order_id
from pagamentos
order by number, case kind when 'deposit' then 0 when 'balance' then 1 else 2 end;
