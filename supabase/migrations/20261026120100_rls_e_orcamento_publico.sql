-- =============================================================
-- Row Level Security: cada dono só enxerga e altera o que é seu.
-- =============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'printers', 'sales_channels', 'filament_brands', 'filaments', 'supplies',
    'cost_sheets', 'cost_sheet_filaments', 'cost_sheet_supplies', 'products', 'product_variants',
    'variant_channel_prices', 'customers', 'document_counters', 'quotes', 'quote_items', 'orders',
    'order_items', 'print_failures', 'filament_movements', 'transactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono gerencia" on public.%I for all to authenticated '
      'using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

-- =============================================================
-- Orçamento público (/o/[token])
-- Retorna SOMENTE campos públicos. Custos (unit_cost) nunca saem daqui.
-- Rascunhos não são visíveis.
-- =============================================================
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
    'created_at', v_quote.created_at,
    'valid_until', v_quote.valid_until,
    'production_days', v_quote.production_days,
    'discount_type', v_quote.discount_type,
    'discount_value', v_quote.discount_value,
    'shipping_cost', v_quote.shipping_cost,
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
        'terms', s.default_quote_terms
      )
      from public.settings s where s.owner_id = v_quote.owner_id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Aprovação pelo cliente: só orçamentos enviados e dentro da validade.
-- Qualquer outro caso levanta erro e não altera nada. A mensagem é um código
-- estável que a página pública traduz para o cliente:
--   quote_not_found | quote_not_sent | quote_already_approved | quote_rejected | quote_expired
create or replace function public.approve_public_quote(p_token text)
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
  end if;

  update public.quotes
  set status = 'approved', approved_at = now()
  where id = v_quote.id;
end;
$$;

revoke all on function public.get_public_quote(text) from public;
revoke all on function public.approve_public_quote(text) from public;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.approve_public_quote(text) to anon, authenticated;

-- Funções internas de trigger não devem ser chamáveis via API.
revoke all on function public.assign_quote_number() from public, anon, authenticated;
