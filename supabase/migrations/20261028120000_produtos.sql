-- =============================================================
-- Fase 6: produtos e variações.
--   1. Marca na ficha o carretel que foi excluído (para avisar e usar a média do material).
--   2. SKU único no catálogo inteiro do dono: produtos e variações juntos.
--   3. save_product: produto, variações e preços por canal numa transação só.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Carretel excluído
-- O FK zera filament_id quando o carretel é excluído (on delete set null). Sem esta marca,
-- a linha ficaria igual a uma escolha consciente de "média do material".
-- Salvar a ficha de novo na calculadora regrava as linhas e limpa a marca.
-- -------------------------------------------------------------
alter table public.cost_sheet_filaments
  add column spool_removed boolean not null default false;

create or replace function public.mark_spool_removed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.filament_id is not null and new.filament_id is null then
    new.spool_removed := true;
  end if;
  return new;
end;
$$;

create trigger mark_spool_removed
  before update of filament_id on public.cost_sheet_filaments
  for each row execute function public.mark_spool_removed();

-- -------------------------------------------------------------
-- 2. SKU único entre produtos e variações (sem diferenciar maiúsculas e espaços nas pontas)
-- O lock por dono evita que dois salvamentos simultâneos passem pela checagem ao mesmo tempo.
-- -------------------------------------------------------------
create or replace function public.check_catalog_sku()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sku text;
begin
  new.sku := nullif(btrim(new.sku), '');
  if new.sku is null then
    return new;
  end if;
  v_sku := lower(new.sku);

  perform pg_advisory_xact_lock(hashtextextended('catalog_sku:' || new.owner_id::text, 0));

  if exists (
    select 1 from public.products p
    where p.owner_id = new.owner_id and lower(p.sku) = v_sku
      and (tg_table_name <> 'products' or p.id <> new.id)
  ) or exists (
    select 1 from public.product_variants v
    where v.owner_id = new.owner_id and lower(v.sku) = v_sku
      and (tg_table_name <> 'product_variants' or v.id <> new.id)
  ) then
    raise exception 'SKU "%" já está em uso no catálogo.', new.sku
      using errcode = '23505', constraint = 'catalog_sku_unique';
  end if;
  return new;
end;
$$;

create trigger check_catalog_sku
  before insert or update of sku on public.products
  for each row execute function public.check_catalog_sku();

create trigger check_catalog_sku
  before insert or update of sku on public.product_variants
  for each row execute function public.check_catalog_sku();

-- -------------------------------------------------------------
-- 3. Salvar produto
-- security invoker: roda com as permissões (e o RLS) de quem chama.
-- Variações são atualizadas no lugar (orçamentos e pedidos apontam para elas);
-- só as que saíram da lista são removidas. Preço vazio = sem preço naquele canal.
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
      insert into public.product_variants (product_id, name, sku, cost_sheet_id, image_path, active, sort_order)
      values (
        v_id,
        v_variant->>'name',
        v_variant->>'sku',
        nullif(v_variant->>'costSheetId', '')::uuid,
        nullif(v_variant->>'imagePath', ''),
        coalesce((v_variant->>'active')::boolean, true),
        (v_ord - 1)::integer
      )
      returning id into v_variant_id;
    else
      update public.product_variants set
        name = v_variant->>'name',
        sku = v_variant->>'sku',
        cost_sheet_id = nullif(v_variant->>'costSheetId', '')::uuid,
        image_path = nullif(v_variant->>'imagePath', ''),
        active = coalesce((v_variant->>'active')::boolean, true),
        sort_order = (v_ord - 1)::integer
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
