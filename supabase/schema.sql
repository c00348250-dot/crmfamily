-- CRM Family - schema inicial
-- Execute este arquivo no SQL Editor de um projeto Supabase novo.
-- Todas as tabelas em public possuem RLS e grants explícitos para authenticated.

create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete restrict,
  role text not null check (role in ('super_admin', 'store_admin', 'store_user')),
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profile_company_role_check check (
    (role = 'super_admin' and company_id is null)
    or
    (role in ('store_admin', 'store_user') and company_id is not null)
  )
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  document text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_company_idx on public.customers(company_id);
create index customers_name_idx on public.customers(company_id, name);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  document text,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_company_idx on public.suppliers(company_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  category text,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  price numeric(14,2) not null default 0 check (price >= 0),
  stock_qty numeric(14,3) not null default 0 check (stock_qty >= 0),
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, sku)
);

create index products_company_idx on public.products(company_id);
create index products_barcode_idx on public.products(company_id, barcode);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('entry', 'exit', 'adjustment')),
  quantity numeric(14,3) not null check (quantity > 0),
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_company_idx on public.inventory_movements(company_id, created_at desc);
create index inventory_product_idx on public.inventory_movements(product_id, created_at desc);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sale_number bigint generated always as identity,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  payment_method text,
  payment_status text not null check (payment_status in ('paid', 'partial', 'pending')),
  sold_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index sales_company_date_idx on public.sales(company_id, sold_at desc);
create index sales_customer_idx on public.sales(customer_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0)
);

create index sale_items_sale_idx on public.sale_items(sale_id);
create index sale_items_company_idx on public.sale_items(company_id);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  sale_id uuid references public.sales(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_company_date_idx on public.financial_transactions(company_id, created_at desc);
create index financial_due_idx on public.financial_transactions(company_id, due_date);

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete set null,
  description text not null,
  amount_total numeric(14,2) not null check (amount_total > 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_paid <= amount_total)
);

create index receivables_company_due_idx on public.receivables(company_id, due_date);
create index receivables_customer_idx on public.receivables(customer_id);

-- Datas de atualização
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger financial_updated_at before update on public.financial_transactions
for each row execute function public.set_updated_at();
create trigger receivables_updated_at before update on public.receivables
for each row execute function public.set_updated_at();

-- RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.receivables enable row level security;

-- Empresas: cada loja vê apenas a sua; SuperAdmin vê todas.
create policy companies_select on public.companies
for select to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  or id = nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid
);

-- Perfil: usuário vê seu próprio perfil; SuperAdmin vê todos.
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- Políticas operacionais repetidas por tabela.
-- SuperAdmin: SELECT global. Loja: SELECT/INSERT/UPDATE/DELETE apenas do próprio company_id.

create policy customers_select on public.customers for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy customers_insert on public.customers for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy customers_update on public.customers for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid)
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy customers_delete on public.customers for delete to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy suppliers_select on public.suppliers for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy suppliers_insert on public.suppliers for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy suppliers_update on public.suppliers for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid)
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy suppliers_delete on public.suppliers for delete to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy products_select on public.products for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy products_insert on public.products for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy products_update on public.products for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid)
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy products_delete on public.products for delete to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy inventory_select on public.inventory_movements for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy inventory_insert on public.inventory_movements for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy sales_select on public.sales for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy sales_insert on public.sales for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy sales_update on public.sales for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid)
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy sale_items_select on public.sale_items for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy sale_items_insert on public.sale_items for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy financial_select on public.financial_transactions for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy financial_insert on public.financial_transactions for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy financial_update on public.financial_transactions for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid)
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy financial_delete on public.financial_transactions for delete to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

create policy receivables_select on public.receivables for select to authenticated
using ((auth.jwt()->'app_metadata'->>'role') = 'super_admin' or company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy receivables_insert on public.receivables for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy receivables_update on public.receivables for update to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid)
with check ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);
create policy receivables_delete on public.receivables for delete to authenticated
using ((auth.jwt()->'app_metadata'->>'role') in ('store_admin','store_user') and company_id = nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid);

-- Ajuste de estoque atômico e auditável.
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity_change numeric,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_stock numeric;
  v_new_stock numeric;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') then
    raise exception 'Sem permissão para alterar estoque';
  end if;

  select company_id, stock_qty
    into v_company_id, v_stock
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  if v_company_id <> nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid then
    raise exception 'Produto pertence a outra empresa';
  end if;

  v_new_stock := v_stock + p_quantity_change;
  if v_new_stock < 0 then
    raise exception 'Estoque insuficiente';
  end if;

  update public.products
     set stock_qty = v_new_stock
   where id = p_product_id;

  insert into public.inventory_movements(
    company_id, product_id, movement_type, quantity, reason, created_by
  ) values (
    v_company_id,
    p_product_id,
    case when p_quantity_change > 0 then 'entry'
         when p_quantity_change < 0 then 'exit'
         else 'adjustment' end,
    abs(p_quantity_change),
    coalesce(nullif(trim(p_reason), ''), 'Ajuste manual'),
    auth.uid()
  );
end;
$$;

-- Venda atômica: cria venda, itens, baixa estoque, registra movimentação,
-- financeiro e eventual dívida do cliente em uma única transação.
create or replace function public.create_sale(
  p_customer_id uuid,
  p_discount numeric,
  p_payment_method text,
  p_payment_status text,
  p_amount_paid numeric,
  p_due_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_sale_id uuid;
  v_item jsonb;
  v_product record;
  v_qty numeric;
  v_subtotal numeric := 0;
  v_discount numeric := greatest(coalesce(p_discount, 0), 0);
  v_total numeric;
  v_paid numeric;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') or v_company_id is null then
    raise exception 'Sem permissão para registrar venda';
  end if;

  if p_payment_status not in ('paid','partial','pending') then
    raise exception 'Situação de pagamento inválida';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa ter ao menos um item';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantidade inválida'; end if;

    select id, company_id, name, price, stock_qty
      into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid and is_active = true
    for update;

    if not found or v_product.company_id <> v_company_id then
      raise exception 'Produto inválido';
    end if;
    if v_product.stock_qty < v_qty then
      raise exception 'Estoque insuficiente para %', v_product.name;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);
  v_paid := least(greatest(coalesce(p_amount_paid, 0), 0), v_total);

  if p_payment_status = 'paid' then v_paid := v_total; end if;
  if p_payment_status = 'pending' then v_paid := 0; end if;
  if p_payment_status = 'partial' and (v_paid <= 0 or v_paid >= v_total) then
    raise exception 'Pagamento parcial deve ser maior que zero e menor que o total';
  end if;
  if p_payment_status in ('partial','pending') and p_customer_id is null then
    raise exception 'Venda a prazo exige cliente identificado';
  end if;

  insert into public.sales(
    company_id, customer_id, subtotal, discount, total, amount_paid,
    payment_method, payment_status, created_by
  ) values (
    v_company_id, p_customer_id, v_subtotal, v_discount, v_total, v_paid,
    p_payment_method, p_payment_status, auth.uid()
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    select id, name, price, stock_qty
      into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    insert into public.sale_items(company_id, sale_id, product_id, product_name, quantity, unit_price, line_total)
    values(v_company_id, v_sale_id, v_product.id, v_product.name, v_qty, v_product.price, v_product.price * v_qty);

    update public.products set stock_qty = stock_qty - v_qty where id = v_product.id;

    insert into public.inventory_movements(
      company_id, product_id, movement_type, quantity, reason,
      reference_type, reference_id, created_by
    ) values (
      v_company_id, v_product.id, 'exit', v_qty, 'Venda',
      'sale', v_sale_id, auth.uid()
    );
  end loop;

  if v_paid > 0 then
    insert into public.financial_transactions(
      company_id, transaction_type, category, description, amount,
      status, paid_at, sale_id, customer_id, created_by
    ) values (
      v_company_id, 'income', 'Vendas', 'Recebimento de venda', v_paid,
      'paid', now(), v_sale_id, p_customer_id, auth.uid()
    );
  end if;

  if v_paid < v_total then
    insert into public.receivables(
      company_id, customer_id, sale_id, description, amount_total,
      amount_paid, due_date, status, created_by
    ) values (
      v_company_id, p_customer_id, v_sale_id, 'Venda a prazo', v_total,
      v_paid, coalesce(p_due_date, current_date + 30),
      case when v_paid > 0 then 'partial' else 'open' end,
      auth.uid()
    );
  end if;

  return v_sale_id;
end;
$$;

create or replace function public.record_receivable_payment(
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_method text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receivable record;
  v_remaining numeric;
  v_new_paid numeric;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') then
    raise exception 'Sem permissão';
  end if;
  if p_amount <= 0 then raise exception 'Valor inválido'; end if;

  select * into v_receivable
  from public.receivables
  where id = p_receivable_id and status in ('open','partial')
  for update;

  if not found then raise exception 'Conta a receber não encontrada'; end if;

  v_remaining := v_receivable.amount_total - v_receivable.amount_paid;
  if p_amount > v_remaining then raise exception 'Pagamento maior que o saldo devedor'; end if;
  v_new_paid := v_receivable.amount_paid + p_amount;

  update public.receivables
     set amount_paid = v_new_paid,
         status = case when v_new_paid >= amount_total then 'paid' else 'partial' end
   where id = p_receivable_id;

  if v_receivable.sale_id is not null then
    update public.sales
       set amount_paid = least(total, amount_paid + p_amount),
           payment_status = case when amount_paid + p_amount >= total then 'paid' else 'partial' end
     where id = v_receivable.sale_id;
  end if;

  insert into public.financial_transactions(
    company_id, transaction_type, category, description, amount,
    status, paid_at, sale_id, customer_id, created_by
  ) values (
    v_receivable.company_id, 'income', 'Recebimentos',
    'Recebimento de cliente - ' || coalesce(p_payment_method, 'não informado'),
    p_amount, 'paid', now(), v_receivable.sale_id, v_receivable.customer_id, auth.uid()
  );
end;
$$;

-- Exposição explícita à Data API. RLS continua sendo a autorização de linhas.
grant usage on schema public to authenticated;
grant select on public.companies, public.profiles to authenticated;
grant select, insert, update, delete on
  public.customers,
  public.suppliers,
  public.products,
  public.sales,
  public.financial_transactions,
  public.receivables
  to authenticated;
grant select, insert on public.inventory_movements, public.sale_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.adjust_stock(uuid, numeric, text) from public, anon;
revoke all on function public.create_sale(uuid, numeric, text, text, numeric, date, jsonb) from public, anon;
revoke all on function public.record_receivable_payment(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
grant execute on function public.create_sale(uuid, numeric, text, text, numeric, date, jsonb) to authenticated;
grant execute on function public.record_receivable_payment(uuid, numeric, text) to authenticated;

-- Empresas iniciais
insert into public.companies(name, slug, business_type)
values
  ('Sexy Shop', 'sexy-shop', 'varejo'),
  ('Loja de Celular', 'loja-celular', 'varejo'),
  ('PetShop', 'petshop', 'pet')
on conflict (slug) do nothing;
