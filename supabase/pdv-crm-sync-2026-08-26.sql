-- CRM Family - sincronização PDV <-> CRM e estoque por variações - 2026-08-26
-- Execute depois de:
--   supabase/upgrade-2026-08-21.sql
--   supabase/pdv-2026-08-22.sql
--
-- O PDV e o CRM usam as mesmas tabelas. Esta migration mantém o estoque agregado
-- do produto base sincronizado com a soma das variações, para que dashboards,
-- relatórios e alertas que leem products.stock_qty reflitam as vendas por variação.

create or replace function public.sync_parent_product_variant_stock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then
    v_product_id := old.product_id;
  else
    v_product_id := new.product_id;
  end if;

  if v_product_id is not null then
    update public.products p
    set stock_qty = coalesce((
      select sum(v.stock_qty)
      from public.product_variants v
      where v.product_id = v_product_id
        and v.is_active = true
    ), 0)
    where p.id = v_product_id;
  end if;

  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id and old.product_id is not null then
    update public.products p
    set stock_qty = coalesce((
      select sum(v.stock_qty)
      from public.product_variants v
      where v.product_id = old.product_id
        and v.is_active = true
    ), 0)
    where p.id = old.product_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists product_variants_sync_parent_stock on public.product_variants;
create trigger product_variants_sync_parent_stock
after insert or update of stock_qty, is_active, product_id or delete
on public.product_variants
for each row execute function public.sync_parent_product_variant_stock();

-- Backfill dos produtos que já possuem variações.
update public.products p
set stock_qty = totals.total_stock
from (
  select product_id, coalesce(sum(stock_qty) filter (where is_active = true), 0) as total_stock
  from public.product_variants
  group by product_id
) totals
where p.id = totals.product_id;

-- Índice para acelerar consultas/atualizações do total por produto.
create index if not exists product_variants_product_active_idx
  on public.product_variants(product_id, is_active);
