-- CRM Family - gestão segura de movimentações financeiras - 2026-08-27
-- Execute depois de supabase/pdv-crm-sync-2026-08-26.sql.

alter table public.financial_transactions
  add column if not exists source_type text not null default 'manual';

alter table public.financial_transactions drop constraint if exists financial_transactions_source_type_check;
alter table public.financial_transactions add constraint financial_transactions_source_type_check
  check (source_type in ('manual','sale','pos','purchase'));

update public.financial_transactions
set source_type = case
  when cash_session_id is not null then 'pos'
  when sale_id is not null then 'sale'
  when category = 'Compras' and description like 'Compra de mercadorias #%' then 'purchase'
  else 'manual'
end;

create or replace function public.protect_financial_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.source_type := old.source_type;
  else
    new.source_type := case
      when new.cash_session_id is not null then 'pos'
      when new.sale_id is not null then 'sale'
      when new.category = 'Compras' and new.description like 'Compra de mercadorias #%' then 'purchase'
      else 'manual'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_transactions_source on public.financial_transactions;
create trigger financial_transactions_source
before insert or update on public.financial_transactions
for each row execute function public.protect_financial_source();

drop function if exists public.update_financial_transaction(uuid,date,text,text,text,text,numeric);

create or replace function public.update_financial_transaction(
  p_id uuid,
  p_transaction_date date,
  p_due_date date,
  p_transaction_type text,
  p_category text,
  p_description text,
  p_status text,
  p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_before public.financial_transactions%rowtype;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') or v_company_id is null then
    raise exception 'Sem permissão para editar movimentações financeiras';
  end if;
  if p_transaction_date is null then raise exception 'Data inválida'; end if;
  if p_transaction_type not in ('income','expense') then raise exception 'Tipo inválido'; end if;
  if p_status not in ('pending','paid','cancelled') then raise exception 'Status inválido'; end if;
  if nullif(trim(p_category), '') is null then raise exception 'Categoria obrigatória'; end if;
  if nullif(trim(p_description), '') is null then raise exception 'Descrição obrigatória'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor inválido'; end if;

  select * into v_before
  from public.financial_transactions
  where id = p_id and company_id = v_company_id
  for update;
  if not found then raise exception 'Movimentação não encontrada nesta empresa'; end if;

  update public.financial_transactions
  set created_at = p_transaction_date::timestamp,
      due_date = p_due_date,
      transaction_type = p_transaction_type,
      category = trim(p_category),
      description = trim(p_description),
      status = p_status,
      amount = p_amount,
      paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_id and company_id = v_company_id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),'update','financial_transaction',p_id,
    jsonb_build_object(
      'before', jsonb_build_object('date',v_before.created_at,'due_date',v_before.due_date,'type',v_before.transaction_type,'category',v_before.category,'description',v_before.description,'status',v_before.status,'amount',v_before.amount,'source_type',v_before.source_type),
      'after', jsonb_build_object('date',p_transaction_date,'due_date',p_due_date,'type',p_transaction_type,'category',trim(p_category),'description',trim(p_description),'status',p_status,'amount',p_amount,'source_type',v_before.source_type)
    ));
end;
$$;

create or replace function public.delete_financial_transaction(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_row public.financial_transactions%rowtype;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') or v_company_id is null then
    raise exception 'Sem permissão para excluir movimentações financeiras';
  end if;

  select * into v_row
  from public.financial_transactions
  where id = p_id and company_id = v_company_id
  for update;
  if not found then raise exception 'Movimentação não encontrada nesta empresa'; end if;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),'delete','financial_transaction',p_id,
    jsonb_build_object('deleted',jsonb_build_object('date',v_row.created_at,'type',v_row.transaction_type,'category',v_row.category,'description',v_row.description,'status',v_row.status,'amount',v_row.amount)));

  delete from public.financial_transactions where id = p_id and company_id = v_company_id;
end;
$$;

revoke all on function public.update_financial_transaction(uuid,date,date,text,text,text,text,numeric) from public,anon;
revoke all on function public.delete_financial_transaction(uuid) from public,anon;
grant execute on function public.update_financial_transaction(uuid,date,date,text,text,text,text,numeric) to authenticated;
grant execute on function public.delete_financial_transaction(uuid) to authenticated;
