-- =============================================================
-- Salva uma ficha de custo com filamentos e insumos numa transação só.
-- security invoker: roda com as permissões (e o RLS) de quem chama.
-- O custo unitário é calculado no servidor (lib/pricing.ts) e enviado em p_unit_cost.
-- =============================================================
create or replace function public.save_cost_sheet(p_sheet jsonb, p_unit_cost numeric)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_sheet->>'id', '')::uuid;
begin
  if v_id is null then
    insert into public.cost_sheets (
      name, printer_id, print_minutes, prep_minutes, post_minutes, purge_g, packaging_cost,
      quantity, pieces_per_plate, unit_cost, calculated_at, source_file_path, notes
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

  insert into public.cost_sheet_supplies (cost_sheet_id, supply_id, name, quantity, unit_cost)
  select
    v_id,
    nullif(e->>'supplyId', '')::uuid,
    e->>'name',
    (e->>'quantity')::numeric,
    (e->>'unitCost')::numeric
  from jsonb_array_elements(coalesce(p_sheet->'extras', '[]'::jsonb)) as t(e);

  return v_id;
end;
$$;

revoke all on function public.save_cost_sheet(jsonb, numeric) from public, anon;
grant execute on function public.save_cost_sheet(jsonb, numeric) to authenticated;
