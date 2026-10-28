-- =============================================================
-- Ajustes da Fase 9: cancelar com estorno e excluir pedido.
--   1. cancel_order(p_order_id, p_printed, p_refund): com p_refund > 0, lança na mesma transação
--      a despesa "Estorno" de hoje (São Paulo), ligada ao pedido (transactions.order_id).
--   2. delete_order(p_order_id, p_number): apaga o pedido como se nunca tivesse existido.
-- =============================================================

drop function if exists public.cancel_order(uuid, boolean);

-- Cancelar. Peças não impressas (p_printed = false): o filamento baixado volta ao carretel.
-- Peças impressas: a baixa fica (as peças são perda). Perdas por falha nunca voltam.
-- p_refund > 0: valor devolvido ao cliente, lançado como Estorno com a data de hoje.
create or replace function public.cancel_order(p_order_id uuid, p_printed boolean, p_refund numeric default 0)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_number text;
begin
  select status, number into v_status, v_number from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'already_cancelled' using errcode = 'P0001';
  end if;

  if not p_printed then
    -- apagar a saída devolve o saldo (trigger apply_filament_movement)
    delete from public.filament_movements where order_id = p_order_id and kind = 'consumption';
    update public.orders set consumed_at = null where id = p_order_id;
  end if;

  if coalesce(p_refund, 0) > 0 then
    insert into public.transactions (kind, category, description, gross_amount, order_id)
    values ('expense', 'refund', format('Estorno do pedido %s', v_number), round(p_refund, 2), p_order_id);
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;
end;
$$;

-- Excluir: pedido, itens, pagamentos, falhas e estornos somem; a baixa e as perdas por falha voltam
-- ao carretel (apagar as movimentações devolve o saldo). O orçamento de origem fica livre para virar
-- pedido de novo. p_number confere o número digitado na confirmação (order_number_mismatch).
create or replace function public.delete_order(p_order_id uuid, p_number text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number text;
begin
  select number into v_number from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if upper(trim(coalesce(p_number, ''))) <> upper(v_number) then
    raise exception 'order_number_mismatch' using errcode = 'P0001';
  end if;

  delete from public.filament_movements where order_id = p_order_id;
  delete from public.print_failures where order_id = p_order_id;
  delete from public.transactions where order_id = p_order_id;
  -- itens e pagamentos saem em cascata
  delete from public.orders where id = p_order_id;
end;
$$;

revoke all on function public.cancel_order(uuid, boolean, numeric) from public, anon;
revoke all on function public.delete_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, boolean, numeric) to authenticated;
grant execute on function public.delete_order(uuid, text) to authenticated;
