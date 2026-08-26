-- CRM Family - PDV / Frente de Caixa - 2026-08-22
-- Execute no SQL Editor do Supabase APOS supabase/upgrade-2026-08-21.sql.
-- Adiciona operador de caixa, sessoes de caixa, pagamentos mistos, sangria/suprimento,
-- comprovantes, cancelamento/estorno e integracao com agenda/OS, sem dar acesso ao CRM administrativo.

-- PERFIL DE CAIXA ---------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','store_admin','store_user','cashier'));

alter table public.profiles drop constraint if exists profile_company_role_check;
alter table public.profiles add constraint profile_company_role_check check (
  (role = 'super_admin' and company_id is null)
  or
  (role in ('store_admin','store_user','cashier') and company_id is not null)
);

-- SESSOES E MOVIMENTACOES DO CAIXA ---------------------------------------------
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  opening_amount numeric(14,2) not null default 0 check (opening_amount >= 0),
  expected_amount numeric(14,2),
  closing_amount numeric(14,2) check (closing_amount is null or closing_amount >= 0),
  difference numeric(14,2),
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  closing_notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists cash_sessions_one_open_per_user
  on public.cash_sessions(company_id, opened_by) where status = 'open';
create index if not exists cash_sessions_company_date_idx
  on public.cash_sessions(company_id, opened_at desc);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  movement_type text not null check (movement_type in ('supply','withdrawal','refund')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cash_movements_session_idx
  on public.cash_movements(cash_session_id, created_at desc);

-- VINCULOS DA VENDA AO PDV ------------------------------------------------------
alter table public.sales add column if not exists cash_session_id uuid references public.cash_sessions(id) on delete set null;
alter table public.sales add column if not exists source text not null default 'crm';
alter table public.sales add column if not exists cancelled_at timestamptz;
alter table public.sales add column if not exists cancelled_by uuid references auth.users(id) on delete set null;
alter table public.sales add column if not exists cancel_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_source_check'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_source_check check (source in ('crm','pos'));
  END IF;
END $$;

alter table public.sale_items add column if not exists unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0);
alter table public.sale_items add column if not exists source_type text;
alter table public.sale_items add column if not exists source_id uuid;
update public.sale_items
set source_type = case when product_name like 'KIT:%' then 'bundle_legacy' else 'product' end
where source_type is null;

create table if not exists public.sale_item_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  stock_target text not null check (stock_target in ('product','variant','none')),
  created_at timestamptz not null default now()
);
create index if not exists sale_item_components_sale_item_idx
  on public.sale_item_components(sale_item_id);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  payment_method text not null check (payment_method in ('cash','pix','debit_card','credit_card','transfer','other')),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'paid' check (status in ('paid','refunded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sale_payments_sale_idx on public.sale_payments(sale_id);
create index if not exists sale_payments_session_idx on public.sale_payments(cash_session_id, created_at desc);

alter table public.financial_transactions add column if not exists cash_session_id uuid references public.cash_sessions(id) on delete set null;

-- VINCULO COM MODULOS ESPECIALIZADOS ------------------------------------------
alter table public.pet_appointments add column if not exists paid_sale_id uuid references public.sales(id) on delete set null;
alter table public.service_orders add column if not exists paid_sale_id uuid references public.sales(id) on delete set null;
alter table public.device_units add column if not exists sale_id uuid references public.sales(id) on delete set null;

-- RLS DOS NOVOS DADOS -----------------------------------------------------------
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.sale_payments enable row level security;
alter table public.sale_item_components enable row level security;

drop policy if exists cash_sessions_select on public.cash_sessions;
create policy cash_sessions_select on public.cash_sessions for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user','cashier')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists cash_movements_select on public.cash_movements;
create policy cash_movements_select on public.cash_movements for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user','cashier')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists sale_payments_select on public.sale_payments;
create policy sale_payments_select on public.sale_payments for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user','cashier')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists sale_item_components_select on public.sale_item_components;
create policy sale_item_components_select on public.sale_item_components for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user','cashier')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

grant select on public.cash_sessions, public.cash_movements, public.sale_payments, public.sale_item_components to authenticated;

-- O operador de caixa pode consultar apenas dados operacionais. Dados de gestao
-- continuam protegidos mesmo se alguem tentar chamar o REST do Supabase manualmente.
drop policy if exists financial_select on public.financial_transactions;
create policy financial_select on public.financial_transactions for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists receivables_select on public.receivables;
create policy receivables_select on public.receivables for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists inventory_select on public.inventory_movements;
create policy inventory_select on public.inventory_movements for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select on public.purchase_items for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user')
    and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid
  )
);

-- FUNCOES AUXILIARES ------------------------------------------------------------
create or replace function public.pos_role_allowed()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user','cashier')
     and nullif(auth.jwt()->'app_metadata'->>'company_id','') is not null;
$$;

create or replace function public.open_cash_session(
  p_opening_amount numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_session_id uuid;
begin
  if not public.pos_role_allowed() or v_company_id is null then
    raise exception 'Sem permissao para abrir caixa';
  end if;
  if coalesce(p_opening_amount, 0) < 0 then raise exception 'Valor inicial invalido'; end if;

  if exists (
    select 1 from public.cash_sessions
    where company_id = v_company_id and opened_by = auth.uid() and status = 'open'
  ) then
    raise exception 'Ja existe um caixa aberto para este usuario';
  end if;

  insert into public.cash_sessions(company_id, opening_amount, opened_by, notes)
  values(v_company_id, coalesce(p_opening_amount,0), auth.uid(), nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_session_id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),'open','cash_session',v_session_id,jsonb_build_object('opening_amount',coalesce(p_opening_amount,0)));

  return v_session_id;
end;
$$;

create or replace function public.add_cash_movement(
  p_cash_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_session public.cash_sessions%rowtype;
  v_id uuid;
begin
  if not public.pos_role_allowed() or v_company_id is null then raise exception 'Sem permissao'; end if;
  if p_movement_type not in ('supply','withdrawal') then raise exception 'Tipo de movimento invalido'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Valor invalido'; end if;
  if nullif(trim(coalesce(p_description,'')),'') is null then raise exception 'Informe a descricao'; end if;

  select * into v_session from public.cash_sessions where id = p_cash_session_id for update;
  if not found or v_session.company_id <> v_company_id or v_session.status <> 'open' then
    raise exception 'Caixa invalido ou fechado';
  end if;
  if (auth.jwt()->'app_metadata'->>'role') = 'cashier' and v_session.opened_by <> auth.uid() then
    raise exception 'Este caixa pertence a outro operador';
  end if;

  insert into public.cash_movements(company_id,cash_session_id,movement_type,amount,description,created_by)
  values(v_company_id,p_cash_session_id,p_movement_type,p_amount,trim(p_description),auth.uid())
  returning id into v_id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),p_movement_type,'cash_movement',v_id,jsonb_build_object('amount',p_amount,'description',trim(p_description)));

  return v_id;
end;
$$;

create or replace function public.close_cash_session(
  p_cash_session_id uuid,
  p_closing_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_session public.cash_sessions%rowtype;
  v_cash_sales numeric := 0;
  v_supplies numeric := 0;
  v_outflows numeric := 0;
  v_expected numeric := 0;
  v_difference numeric := 0;
begin
  if not public.pos_role_allowed() or v_company_id is null then raise exception 'Sem permissao'; end if;
  if coalesce(p_closing_amount,-1) < 0 then raise exception 'Valor contado invalido'; end if;

  select * into v_session from public.cash_sessions where id = p_cash_session_id for update;
  if not found or v_session.company_id <> v_company_id or v_session.status <> 'open' then
    raise exception 'Caixa invalido ou ja fechado';
  end if;
  if (auth.jwt()->'app_metadata'->>'role') = 'cashier' and v_session.opened_by <> auth.uid() then
    raise exception 'Este caixa pertence a outro operador';
  end if;

  select coalesce(sum(sp.amount),0) into v_cash_sales
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  where sp.cash_session_id = p_cash_session_id
    and sp.payment_method = 'cash'
    and sp.status = 'paid'
    and s.status = 'completed';

  select coalesce(sum(amount),0) into v_supplies
  from public.cash_movements
  where cash_session_id = p_cash_session_id and movement_type = 'supply';

  select coalesce(sum(amount),0) into v_outflows
  from public.cash_movements
  where cash_session_id = p_cash_session_id and movement_type in ('withdrawal','refund');

  v_expected := v_session.opening_amount + v_cash_sales + v_supplies - v_outflows;
  v_difference := p_closing_amount - v_expected;

  update public.cash_sessions
  set status='closed', expected_amount=v_expected, closing_amount=p_closing_amount,
      difference=v_difference, closed_by=auth.uid(), closed_at=now(),
      closing_notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=p_cash_session_id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),'close','cash_session',p_cash_session_id,
    jsonb_build_object('expected',v_expected,'counted',p_closing_amount,'difference',v_difference));

  return jsonb_build_object('expected',v_expected,'counted',p_closing_amount,'difference',v_difference);
end;
$$;

-- VENDA ATOMICA DO PDV ----------------------------------------------------------
create or replace function public.create_pos_sale(
  p_cash_session_id uuid,
  p_customer_id uuid,
  p_discount numeric,
  p_due_date date,
  p_items jsonb,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_role text := auth.jwt()->'app_metadata'->>'role';
  v_session public.cash_sessions%rowtype;
  v_sale_id uuid;
  v_sale_number bigint;
  v_item jsonb;
  v_payment jsonb;
  v_source_type text;
  v_source_id uuid;
  v_qty numeric;
  v_discount numeric := greatest(coalesce(p_discount,0),0);
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_customer_id uuid := p_customer_id;
  v_product record;
  v_variant record;
  v_bundle record;
  v_component record;
  v_device record;
  v_order record;
  v_appointment record;
  v_sale_item_id uuid;
  v_method text;
  v_amount numeric;
  v_payment_status text;
  v_bundle_unit_cost numeric;
  v_rows integer;
begin
  if not public.pos_role_allowed() or v_company_id is null then raise exception 'Sem permissao para registrar venda'; end if;

  select * into v_session from public.cash_sessions where id=p_cash_session_id for update;
  if not found or v_session.company_id <> v_company_id or v_session.status <> 'open' then
    raise exception 'Abra o caixa antes de registrar vendas';
  end if;
  if v_role = 'cashier' and v_session.opened_by <> auth.uid() then
    raise exception 'Este caixa pertence a outro operador';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers where id=p_customer_id and company_id=v_company_id and is_active=true
  ) then raise exception 'Cliente invalido'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'A venda precisa ter ao menos um item';
  end if;

  if exists (
    select 1
    from (
      select x->>'source_type' as source_type, x->>'source_id' as source_id, count(*)
      from jsonb_array_elements(p_items) x
      group by 1,2 having count(*) > 1
    ) duplicated
  ) then raise exception 'Existem itens duplicados no carrinho'; end if;

  -- Primeira passagem: valida tudo e calcula subtotal. Nenhuma baixa ocorre antes disso.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_source_type := v_item->>'source_type';
    begin
      v_source_id := (v_item->>'source_id')::uuid;
      v_qty := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'Item invalido';
    end;
    if v_qty <= 0 then raise exception 'Quantidade invalida'; end if;

    if v_source_type = 'product' then
      select id,company_id,name,price,cost,stock_qty into v_product
      from public.products where id=v_source_id and is_active=true for update;
      if not found or v_product.company_id <> v_company_id then raise exception 'Produto invalido'; end if;
      if v_product.stock_qty < v_qty then raise exception 'Estoque insuficiente para %',v_product.name; end if;
      v_subtotal := v_subtotal + v_product.price*v_qty;

    elsif v_source_type = 'variant' then
      select pv.id,pv.company_id,pv.product_id,pv.sku,pv.color,pv.size,pv.model,pv.flavor,pv.volume,
             pv.stock_qty,coalesce(pv.price_override,p.price) as price,p.name,p.cost
      into v_variant
      from public.product_variants pv join public.products p on p.id=pv.product_id
      where pv.id=v_source_id and pv.is_active=true and p.is_active=true for update of pv;
      if not found or v_variant.company_id <> v_company_id then raise exception 'Variacao invalida'; end if;
      if v_variant.stock_qty < v_qty then raise exception 'Estoque insuficiente para a variacao %',v_variant.sku; end if;
      v_subtotal := v_subtotal + v_variant.price*v_qty;

    elsif v_source_type = 'bundle' then
      select id,company_id,name,price into v_bundle
      from public.bundles where id=v_source_id and is_active=true;
      if not found or v_bundle.company_id <> v_company_id then raise exception 'Kit invalido'; end if;
      if not exists(select 1 from public.bundle_items where bundle_id=v_source_id) then raise exception 'Kit sem componentes'; end if;
      for v_component in
        select bi.quantity,p.id as product_id,p.name,p.stock_qty,p.cost
        from public.bundle_items bi join public.products p on p.id=bi.product_id
        where bi.bundle_id=v_source_id
        for update of p
      loop
        if v_component.stock_qty < v_component.quantity*v_qty then
          raise exception 'Estoque insuficiente para % no kit %',v_component.name,v_bundle.name;
        end if;
      end loop;
      v_subtotal := v_subtotal + v_bundle.price*v_qty;

    elsif v_source_type = 'device_unit' then
      if v_qty <> 1 then raise exception 'Aparelho por IMEI deve ser vendido uma unidade por vez'; end if;
      select id,company_id,product_id,brand,model,imei,purchase_cost,sale_price,status into v_device
      from public.device_units where id=v_source_id for update;
      if not found or v_device.company_id <> v_company_id or v_device.status <> 'in_stock' then raise exception 'Aparelho indisponivel'; end if;
      v_subtotal := v_subtotal + v_device.sale_price;

    elsif v_source_type = 'service_order' then
      if v_qty <> 1 then raise exception 'Ordem de servico deve ser recebida uma vez'; end if;
      select id,company_id,customer_id,order_number,device_brand,device_model,quote_amount,parts_cost,labor_amount,status,paid_sale_id
      into v_order from public.service_orders where id=v_source_id for update;
      if not found or v_order.company_id <> v_company_id or v_order.status <> 'ready' or v_order.paid_sale_id is not null then
        raise exception 'Ordem de servico nao esta pronta para recebimento';
      end if;
      if v_order.customer_id is not null then
        if v_customer_id is null then v_customer_id := v_order.customer_id;
        elsif v_customer_id <> v_order.customer_id then raise exception 'O carrinho possui clientes diferentes'; end if;
      end if;
      v_subtotal := v_subtotal + v_order.quote_amount;

    elsif v_source_type = 'pet_appointment' then
      if v_qty <> 1 then raise exception 'Agendamento deve ser recebido uma vez'; end if;
      select id,company_id,customer_id,pet_id,service_type,price,status,paid_sale_id
      into v_appointment from public.pet_appointments where id=v_source_id for update;
      if not found or v_appointment.company_id <> v_company_id or v_appointment.status <> 'ready' or v_appointment.paid_sale_id is not null then
        raise exception 'Atendimento nao esta pronto para recebimento';
      end if;
      if v_customer_id is null then v_customer_id := v_appointment.customer_id;
      elsif v_customer_id <> v_appointment.customer_id then raise exception 'O carrinho possui clientes diferentes'; end if;
      v_subtotal := v_subtotal + v_appointment.price;
    else
      raise exception 'Tipo de item nao suportado';
    end if;
  end loop;

  v_total := greatest(v_subtotal-v_discount,0);
  if v_discount > v_subtotal then raise exception 'Desconto maior que o subtotal'; end if;

  if p_payments is not null and jsonb_typeof(p_payments) <> 'array' then raise exception 'Pagamentos invalidos'; end if;
  if p_payments is not null then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      v_method := v_payment->>'payment_method';
      begin v_amount := (v_payment->>'amount')::numeric;
      exception when others then raise exception 'Valor de pagamento invalido'; end;
      if v_method not in ('cash','pix','debit_card','credit_card','transfer','other') then raise exception 'Forma de pagamento invalida'; end if;
      if v_amount <= 0 then raise exception 'Valor de pagamento deve ser maior que zero'; end if;
      v_paid := v_paid + v_amount;
    end loop;
  end if;

  if v_paid > v_total + 0.009 then raise exception 'Pagamentos ultrapassam o total da venda'; end if;
  v_paid := least(v_paid,v_total);
  v_remaining := v_total-v_paid;
  if v_remaining > 0 and v_customer_id is null then raise exception 'Saldo pendente exige cliente identificado'; end if;

  v_payment_status := case when v_remaining <= 0.009 then 'paid' when v_paid > 0 then 'partial' else 'pending' end;

  insert into public.sales(company_id,customer_id,subtotal,discount,total,amount_paid,payment_method,payment_status,created_by,cash_session_id,source)
  values(v_company_id,v_customer_id,v_subtotal,v_discount,v_total,v_paid,
         case when p_payments is null or jsonb_array_length(p_payments)=0 then 'A prazo'
              when jsonb_array_length(p_payments)>1 then 'Misto'
              else (select case x->>'payment_method'
                     when 'cash' then 'Dinheiro' when 'pix' then 'Pix' when 'debit_card' then 'Cartao de debito'
                     when 'credit_card' then 'Cartao de credito' when 'transfer' then 'Transferencia' else 'Outro' end
                    from jsonb_array_elements(p_payments) x limit 1) end,
         v_payment_status,auth.uid(),p_cash_session_id,'pos')
  returning id,sale_number into v_sale_id,v_sale_number;

  -- Segunda passagem: grava itens e efetiva baixas atomicas.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_source_type := v_item->>'source_type';
    v_source_id := (v_item->>'source_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    if v_source_type = 'product' then
      select id,name,price,cost,stock_qty into v_product from public.products where id=v_source_id for update;
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,v_product.id,v_product.name,v_qty,v_product.price,v_product.price*v_qty,v_product.cost,'product',v_product.id)
      returning id into v_sale_item_id;
      update public.products set stock_qty=stock_qty-v_qty where id=v_product.id;
      insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
      values(v_company_id,v_product.id,'exit',v_qty,'Venda PDV','sale',v_sale_id,auth.uid());
      insert into public.sale_item_components(company_id,sale_item_id,product_id,quantity,unit_cost,stock_target)
      values(v_company_id,v_sale_item_id,v_product.id,v_qty,v_product.cost,'product');

    elsif v_source_type = 'variant' then
      select pv.id,pv.product_id,pv.sku,pv.color,pv.size,pv.model,pv.flavor,pv.volume,pv.stock_qty,
             coalesce(pv.price_override,p.price) as price,p.name,p.cost
      into v_variant from public.product_variants pv join public.products p on p.id=pv.product_id
      where pv.id=v_source_id for update of pv;
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,v_variant.product_id,
        v_variant.name||' - '||v_variant.sku,v_qty,v_variant.price,v_variant.price*v_qty,v_variant.cost,'variant',v_variant.id)
      returning id into v_sale_item_id;
      update public.product_variants set stock_qty=stock_qty-v_qty where id=v_variant.id;
      insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
      values(v_company_id,v_variant.product_id,'exit',v_qty,'Venda de variacao '||v_variant.sku,'sale',v_sale_id,auth.uid());
      insert into public.sale_item_components(company_id,sale_item_id,product_id,variant_id,quantity,unit_cost,stock_target)
      values(v_company_id,v_sale_item_id,v_variant.product_id,v_variant.id,v_qty,v_variant.cost,'variant');

    elsif v_source_type = 'bundle' then
      select id,name,price into v_bundle from public.bundles where id=v_source_id;
      select coalesce(sum(bi.quantity*p.cost),0) into v_bundle_unit_cost
      from public.bundle_items bi join public.products p on p.id=bi.product_id where bi.bundle_id=v_source_id;
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,null,'KIT: '||v_bundle.name,v_qty,v_bundle.price,v_bundle.price*v_qty,v_bundle_unit_cost,'bundle',v_bundle.id)
      returning id into v_sale_item_id;
      for v_component in
        select bi.quantity,p.id as product_id,p.name,p.cost from public.bundle_items bi join public.products p on p.id=bi.product_id
        where bi.bundle_id=v_source_id for update of p
      loop
        update public.products set stock_qty=stock_qty-(v_component.quantity*v_qty) where id=v_component.product_id;
        insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
        values(v_company_id,v_component.product_id,'exit',v_component.quantity*v_qty,'Venda de kit '||v_bundle.name,'sale',v_sale_id,auth.uid());
        insert into public.sale_item_components(company_id,sale_item_id,product_id,quantity,unit_cost,stock_target)
        values(v_company_id,v_sale_item_id,v_component.product_id,v_component.quantity*v_qty,v_component.cost,'product');
      end loop;

    elsif v_source_type = 'device_unit' then
      select id,product_id,brand,model,imei,purchase_cost,sale_price,status into v_device
      from public.device_units where id=v_source_id for update;
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,v_device.product_id,
        v_device.brand||' '||v_device.model||coalesce(' - IMEI '||v_device.imei,''),1,v_device.sale_price,v_device.sale_price,v_device.purchase_cost,'device_unit',v_device.id)
      returning id into v_sale_item_id;
      update public.device_units set status='sold',sold_at=now(),sale_id=v_sale_id where id=v_device.id;
      if v_device.product_id is not null then
        update public.products set stock_qty=stock_qty-1 where id=v_device.product_id and stock_qty>=1;
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then raise exception 'Estoque do produto vinculado ao aparelho e insuficiente'; end if;
        insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
        values(v_company_id,v_device.product_id,'exit',1,'Venda por IMEI','sale',v_sale_id,auth.uid());
        insert into public.sale_item_components(company_id,sale_item_id,product_id,quantity,unit_cost,stock_target)
        values(v_company_id,v_sale_item_id,v_device.product_id,1,v_device.purchase_cost,'product');
      end if;

    elsif v_source_type = 'service_order' then
      select id,order_number,device_brand,device_model,quote_amount,parts_cost,labor_amount into v_order
      from public.service_orders where id=v_source_id for update;
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,null,'OS #'||v_order.order_number||' - '||v_order.device_brand||' '||v_order.device_model,
        1,v_order.quote_amount,v_order.quote_amount,v_order.parts_cost,'service_order',v_order.id);
      update public.service_orders set status='delivered',delivered_at=now(),paid_sale_id=v_sale_id where id=v_order.id;

    elsif v_source_type = 'pet_appointment' then
      select id,service_type,price into v_appointment from public.pet_appointments where id=v_source_id for update;
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,null,'Servico pet - '||v_appointment.service_type,1,v_appointment.price,v_appointment.price,0,'pet_appointment',v_appointment.id);
      update public.pet_appointments set status='delivered',paid_sale_id=v_sale_id where id=v_appointment.id;
    end if;
  end loop;

  if p_payments is not null then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      v_method := v_payment->>'payment_method';
      v_amount := (v_payment->>'amount')::numeric;
      insert into public.sale_payments(company_id,sale_id,cash_session_id,payment_method,amount,created_by)
      values(v_company_id,v_sale_id,p_cash_session_id,v_method,v_amount,auth.uid());

      insert into public.financial_transactions(company_id,transaction_type,category,description,amount,status,paid_at,sale_id,customer_id,created_by,cash_session_id)
      values(v_company_id,'income','Vendas','Recebimento PDV venda #'||v_sale_number||' - '||
        case v_method when 'cash' then 'Dinheiro' when 'pix' then 'Pix' when 'debit_card' then 'Cartao de debito'
        when 'credit_card' then 'Cartao de credito' when 'transfer' then 'Transferencia' else 'Outro' end,
        v_amount,'paid',now(),v_sale_id,v_customer_id,auth.uid(),p_cash_session_id);
    end loop;
  end if;

  if v_remaining > 0.009 then
    insert into public.receivables(company_id,customer_id,sale_id,description,amount_total,amount_paid,due_date,status,created_by)
    values(v_company_id,v_customer_id,v_sale_id,'Venda PDV a prazo',v_total,v_paid,coalesce(p_due_date,current_date+30),
      case when v_paid>0 then 'partial' else 'open' end,auth.uid());
  end if;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),'create','pos_sale',v_sale_id,
    jsonb_build_object('sale_number',v_sale_number,'total',v_total,'paid',v_paid,'cash_session_id',p_cash_session_id));

  return jsonb_build_object('sale_id',v_sale_id,'sale_number',v_sale_number,'subtotal',v_subtotal,'discount',v_discount,'total',v_total,'amount_paid',v_paid,'payment_status',v_payment_status);
end;
$$;

-- CANCELAMENTO / ESTORNO --------------------------------------------------------
create or replace function public.cancel_pos_sale(
  p_sale_id uuid,
  p_reason text,
  p_refund_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_role text := auth.jwt()->'app_metadata'->>'role';
  v_sale public.sales%rowtype;
  v_original_session public.cash_sessions%rowtype;
  v_refund_session public.cash_sessions%rowtype;
  v_item record;
  v_component record;
  v_cash_refund numeric := 0;
begin
  if not public.pos_role_allowed() or v_company_id is null then raise exception 'Sem permissao'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo do cancelamento'; end if;

  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found or v_sale.company_id<>v_company_id or v_sale.source<>'pos' then raise exception 'Venda PDV invalida'; end if;
  if v_sale.status='cancelled' then raise exception 'Venda ja cancelada'; end if;

  if p_refund_session_id is not null then
    select * into v_refund_session from public.cash_sessions where id=p_refund_session_id for update;
    if not found or v_refund_session.company_id<>v_company_id or v_refund_session.status<>'open' then
      raise exception 'Abra um caixa para registrar o estorno';
    end if;
    if v_role='cashier' and v_refund_session.opened_by<>auth.uid() then raise exception 'Este caixa pertence a outro operador'; end if;
  end if;

  if v_sale.cash_session_id is not null then
    select * into v_original_session from public.cash_sessions where id=v_sale.cash_session_id;
  end if;

  -- Restaura todos os estoques exatamente conforme os componentes consumidos na venda.
  for v_component in
    select sic.* from public.sale_item_components sic
    join public.sale_items si on si.id=sic.sale_item_id
    where si.sale_id=p_sale_id
  loop
    if v_component.stock_target='product' and v_component.product_id is not null then
      update public.products set stock_qty=stock_qty+v_component.quantity where id=v_component.product_id;
      insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
      values(v_company_id,v_component.product_id,'entry',v_component.quantity,'Estorno de venda PDV','sale',p_sale_id,auth.uid());
    elsif v_component.stock_target='variant' and v_component.variant_id is not null then
      update public.product_variants set stock_qty=stock_qty+v_component.quantity where id=v_component.variant_id;
      if v_component.product_id is not null then
        insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
        values(v_company_id,v_component.product_id,'entry',v_component.quantity,'Estorno de variacao PDV','sale',p_sale_id,auth.uid());
      end if;
    end if;
  end loop;

  for v_item in select source_type,source_id from public.sale_items where sale_id=p_sale_id
  loop
    if v_item.source_type='device_unit' then
      update public.device_units set status='in_stock',sold_at=null,sale_id=null where id=v_item.source_id and sale_id=p_sale_id;
    elsif v_item.source_type='service_order' then
      update public.service_orders set status='ready',delivered_at=null,paid_sale_id=null where id=v_item.source_id and paid_sale_id=p_sale_id;
    elsif v_item.source_type='pet_appointment' then
      update public.pet_appointments set status='ready',paid_sale_id=null where id=v_item.source_id and paid_sale_id=p_sale_id;
    end if;
  end loop;

  select coalesce(sum(amount),0) into v_cash_refund
  from public.sale_payments where sale_id=p_sale_id and payment_method='cash' and status='paid';

  -- Se a venda original ja pertencia a um caixa fechado, a devolucao em dinheiro sai do caixa atual.
  if v_cash_refund>0 and v_original_session.status='closed' then
    if p_refund_session_id is null then raise exception 'Abra um caixa para registrar a devolucao em dinheiro'; end if;
    insert into public.cash_movements(company_id,cash_session_id,movement_type,amount,description,sale_id,created_by)
    values(v_company_id,p_refund_session_id,'refund',v_cash_refund,'Estorno da venda #'||v_sale.sale_number,p_sale_id,auth.uid());
  end if;

  update public.sale_payments set status='refunded' where sale_id=p_sale_id and status='paid';
  update public.financial_transactions set status='cancelled',updated_at=now() where sale_id=p_sale_id and status<>'cancelled';
  update public.receivables set status='cancelled',updated_at=now() where sale_id=p_sale_id and status<>'cancelled';
  update public.sales set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_reason) where id=p_sale_id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,details)
  values(v_company_id,auth.uid(),'cancel','pos_sale',p_sale_id,jsonb_build_object('reason',trim(p_reason),'cash_refund',v_cash_refund,'refund_session_id',p_refund_session_id));
end;
$$;

revoke all on function public.pos_role_allowed() from public;
revoke all on function public.open_cash_session(numeric,text) from public;
revoke all on function public.add_cash_movement(uuid,text,numeric,text) from public;
revoke all on function public.close_cash_session(uuid,numeric,text) from public;
revoke all on function public.create_pos_sale(uuid,uuid,numeric,date,jsonb,jsonb) from public;
revoke all on function public.cancel_pos_sale(uuid,text,uuid) from public;

grant execute on function public.pos_role_allowed() to authenticated;
grant execute on function public.open_cash_session(numeric,text) to authenticated;
grant execute on function public.add_cash_movement(uuid,text,numeric,text) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;
grant execute on function public.create_pos_sale(uuid,uuid,numeric,date,jsonb,jsonb) to authenticated;
grant execute on function public.cancel_pos_sale(uuid,text,uuid) to authenticated;
