-- =============================================================
-- Fase 7: clientes, orçamentos, página pública e Pix.
--   1. Revisão do orçamento (aprovação só da versão que o cliente viu), sinal e tipo da chave Pix.
--   2. save_quote: orçamento, cliente rápido e itens numa transação só.
--   3. Página pública: get_public_quote devolve revisão, sinal e dados do Pix;
--      approve_public_quote passa a exigir a revisão carregada (quote_outdated).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Colunas novas
-- -------------------------------------------------------------
alter table public.quotes
  add column revision integer not null default 1 check (revision > 0),
  add column revised_at timestamptz,
  -- sinal em % do total (ex.: 50); null = sem sinal, o Pix cobra o total
  add column deposit_pct numeric(5,2) check (deposit_pct > 0 and deposit_pct <= 100);

create index quotes_owner_status_idx on public.quotes (owner_id, status);
create index quotes_customer_idx on public.quotes (customer_id);

-- 11 dígitos podem ser CPF ou telefone: o tipo diz como montar o BR Code (telefone vai como +55...)
alter table public.settings
  add column pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random'));

-- -------------------------------------------------------------
-- 2. Salvar orçamento
-- security invoker: roda com as permissões (e o RLS) de quem chama.
-- Aprovado ou recusado não muda (quote_locked). Cada salvamento de um orçamento
-- existente incrementa a revisão: a aprovação pública só vale para a revisão vista.
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
    quote_id, variant_id, cost_sheet_id, description, image_path, quantity, unit_price, unit_cost, sort_order
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
    (t.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_quote->'items', '[]'::jsonb)) with ordinality as t(i, ord);

  return v_id;
end;
$$;

revoke all on function public.save_quote(jsonb) from public, anon;
grant execute on function public.save_quote(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 3. Página pública
-- Só leitura (stable): abrir o link, inclusive pelo robô de prévia do WhatsApp, não muda nada.
-- -------------------------------------------------------------
create or replace function public.get_public_quote(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_result jsonb;
begin
  if p_token is null or length(p_token) <> 64 then
    return null;
  end if;

  select * into v_quote from public.quotes where token = p_token and status <> 'draft';
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'number', v_quote.number,
    'status', case
      when v_quote.status = 'sent' and v_quote.valid_until < (now() at time zone 'America/Sao_Paulo')::date
        then 'expired'
      else v_quote.status
    end,
    'revision', v_quote.revision,
    'created_at', v_quote.created_at,
    'sent_at', v_quote.sent_at,
    'revised_at', v_quote.revised_at,
    'valid_until', v_quote.valid_until,
    'production_days', v_quote.production_days,
    'discount_type', v_quote.discount_type,
    'discount_value', v_quote.discount_value,
    'shipping_cost', v_quote.shipping_cost,
    'deposit_pct', v_quote.deposit_pct,
    'payment_terms', v_quote.payment_terms,
    'notes', v_quote.notes,
    'approved_at', v_quote.approved_at,
    'customer_name', (select c.name from public.customers c where c.id = v_quote.customer_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', i.description,
        'image_path', coalesce(i.image_path, v.image_path, p.image_path),
        'quantity', i.quantity,
        'unit_price', i.unit_price
      ) order by i.sort_order, i.created_at)
      from public.quote_items i
      left join public.product_variants v on v.id = i.variant_id
      left join public.products p on p.id = v.product_id
      where i.quote_id = v_quote.id
    ), '[]'::jsonb),
    'store', (
      select jsonb_build_object(
        'name', s.store_name,
        'whatsapp', s.store_whatsapp,
        'instagram', s.store_instagram,
        'email', s.store_email,
        'city', s.store_city,
        'pix_key', s.pix_key,
        'pix_key_type', s.pix_key_type,
        'terms', s.default_quote_terms
      )
      from public.settings s where s.owner_id = v_quote.owner_id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- A versão antiga (só o token) sai: aprovar exige a revisão que a página carregou.
drop function public.approve_public_quote(text);

-- Erros com códigos estáveis que a página pública traduz:
--   quote_not_found | quote_not_sent | quote_already_approved | quote_rejected | quote_expired | quote_outdated
create or replace function public.approve_public_quote(p_token text, p_revision integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
begin
  -- trava a linha para evitar aprovação dupla concorrente
  select * into v_quote from public.quotes where token = p_token for update;

  if not found then
    raise exception 'quote_not_found' using errcode = 'P0002';
  end if;

  if v_quote.status = 'approved' then
    raise exception 'quote_already_approved' using errcode = 'P0001';
  elsif v_quote.status = 'rejected' then
    raise exception 'quote_rejected' using errcode = 'P0001';
  elsif v_quote.status = 'expired'
     or (v_quote.status = 'sent'
         and v_quote.valid_until < (now() at time zone 'America/Sao_Paulo')::date) then
    raise exception 'quote_expired' using errcode = 'P0001';
  elsif v_quote.status <> 'sent' then
    -- rascunho
    raise exception 'quote_not_sent' using errcode = 'P0001';
  elsif p_revision is distinct from v_quote.revision then
    raise exception 'quote_outdated' using errcode = 'P0001';
  end if;

  update public.quotes
  set status = 'approved', approved_at = now()
  where id = v_quote.id;
end;
$$;

revoke all on function public.approve_public_quote(text, integer) from public;
grant execute on function public.approve_public_quote(text, integer) to anon, authenticated;
