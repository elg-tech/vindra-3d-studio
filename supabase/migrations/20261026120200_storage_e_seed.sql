-- =============================================================
-- Storage
--   product-images: leitura pública (fotos aparecem no orçamento)
--   files: privado (.3mf e afins)
-- Caminho dos objetos: <owner_id>/<arquivo>
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('files', 'files', false, 104857600, null)
on conflict (id) do nothing;

create policy "dono envia arquivos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('product-images', 'files')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "dono lê arquivos"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('product-images', 'files')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "dono altera arquivos"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('product-images', 'files')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "dono apaga arquivos"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('product-images', 'files')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =============================================================
-- Seed por usuário: ao criar a conta, prepara configurações,
-- a Bambu Lab A1, os canais (taxas em branco) e um carretel PLA de exemplo.
-- =============================================================
create or replace function public.seed_new_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand uuid;
begin
  insert into public.settings (owner_id) values (new.id);

  insert into public.printers (owner_id, name, model, is_default)
  values (new.id, 'Bambu Lab A1', 'A1', true);

  insert into public.sales_channels (owner_id, name, kind, sort_order) values
    (new.id, 'Shopee', 'shopee', 1),
    (new.id, 'TikTok Shop', 'tiktok', 2),
    (new.id, 'Venda direta', 'direct', 3);

  insert into public.filament_brands (owner_id, name)
  values (new.id, 'Genérica')
  returning id into v_brand;

  insert into public.filaments (owner_id, brand_id, material, color_name, color_hex, price_paid, net_weight_g, notes)
  values (new.id, v_brand, 'PLA', 'Preto', '#111111', 100, 1000, 'Carretel de exemplo — edite ou apague');

  return new;
end;
$$;

revoke all on function public.seed_new_owner() from public, anon, authenticated;

create trigger seed_new_owner
  after insert on auth.users
  for each row execute function public.seed_new_owner();
