-- CRM Family - upgrade 2026-08-21
-- Execute no SQL Editor do Supabase do projeto existente.
-- O script é seguro para reexecução e NÃO inclui PDV / frente de caixa.

-- Identidade correta das empresas ------------------------------------------------
update public.companies set name = 'Sedux', slug = 'sedux', business_type = 'adult_retail'
where slug in ('sexy-shop', 'sedux');
update public.companies set name = 'Schemmer Cell', slug = 'schemmer-cell', business_type = 'cell_service'
where slug in ('loja-celular', 'schemmer-cell');
update public.companies set name = 'House Pet', slug = 'house-pet', business_type = 'pet_service'
where slug in ('petshop', 'house-pet');

-- Custo histórico por item vendido para cálculo de lucro bruto -----------------
alter table public.sale_items add column if not exists unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0);
update public.sale_items si set unit_cost = p.cost
from public.products p
where si.product_id = p.id and si.unit_cost = 0;

create or replace function public.fill_sale_item_cost()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.product_id is not null and coalesce(new.unit_cost, 0) = 0 then
    select cost into new.unit_cost from public.products where id = new.product_id;
  end if;
  return new;
end;
$$;
drop trigger if exists sale_items_fill_cost on public.sale_items;
create trigger sale_items_fill_cost before insert on public.sale_items
for each row execute function public.fill_sale_item_cost();

-- SCHEMMER CELL ----------------------------------------------------------------
create table if not exists public.device_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  brand text not null,
  model text not null,
  imei text,
  serial_number text,
  color text,
  purchase_cost numeric(14,2) not null default 0 check (purchase_cost >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  warranty_days integer not null default 90 check (warranty_days >= 0),
  status text not null default 'in_stock' check (status in ('in_stock','reserved','sold','service')),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, imei)
);

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  order_number bigint generated always as identity,
  device_brand text not null,
  device_model text not null,
  imei text,
  serial_number text,
  color text,
  issue_reported text not null,
  condition_notes text,
  accessories text,
  technician text,
  quote_amount numeric(14,2) not null default 0 check (quote_amount >= 0),
  parts_cost numeric(14,2) not null default 0 check (parts_cost >= 0),
  labor_amount numeric(14,2) not null default 0 check (labor_amount >= 0),
  warranty_days integer not null default 90 check (warranty_days >= 0),
  estimated_delivery date,
  status text not null default 'received' check (status in ('received','analysis','awaiting_approval','awaiting_part','repair','ready','delivered','cancelled')),
  delivered_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_orders_company_status_idx on public.service_orders(company_id,status,created_at desc);
create index if not exists service_orders_imei_idx on public.service_orders(company_id,imei);

-- HOUSE PET --------------------------------------------------------------------
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  species text not null,
  breed text,
  sex text,
  birth_date date,
  weight numeric(8,2) check (weight is null or weight >= 0),
  neutered boolean not null default false,
  allergies text,
  behavior_notes text,
  medications text,
  photo_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pets_customer_idx on public.pets(customer_id);

create table if not exists public.pet_appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_type text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','in_service','ready','delivered','cancelled')),
  price numeric(14,2) not null default 0 check (price >= 0),
  responsible text,
  service_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pet_appointments_company_date_idx on public.pet_appointments(company_id,scheduled_at);

-- SEDUX ------------------------------------------------------------------------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  color text,
  size text,
  model text,
  flavor text,
  volume text,
  stock_qty numeric(14,3) not null default 0 check (stock_qty >= 0),
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  price_override numeric(14,2) check (price_override is null or price_override >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,sku)
);

create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  lot_number text,
  expires_at date not null,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_batches_expiry_idx on public.product_batches(company_id,expires_at);

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  sku text not null,
  price numeric(14,2) not null check (price >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,sku)
);

create table if not exists public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unique(bundle_id,product_id)
);

-- COMPRAS / REPOSIÇÃO ----------------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_number bigint generated always as identity,
  invoice_number text,
  status text not null default 'draft' check (status in ('draft','ordered','received','cancelled')),
  total numeric(14,2) not null default 0 check (total >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  ordered_at date not null default current_date,
  received_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_cost) stored
);
create index if not exists purchases_company_idx on public.purchases(company_id,created_at desc);

-- AUDITORIA --------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_company_idx on public.audit_logs(company_id,created_at desc);

-- updated_at dos novos módulos -------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['device_units','service_orders','pets','pet_appointments','product_variants','product_batches','bundles','purchases']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;

-- Segurança: SuperAdmin lê tudo; usuários operam apenas a própria empresa -------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['device_units','service_orders','pets','pet_appointments','product_variants','product_batches','bundles','bundle_items','purchases','purchase_items','audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((auth.jwt()->''app_metadata''->>''role'') = ''super_admin'' OR company_id = nullif(auth.jwt()->''app_metadata''->>''company_id'','''')::uuid)',
      t || '_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    IF t <> 'audit_logs' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->''app_metadata''->>''role'') IN (''store_admin'',''store_user'') AND company_id = nullif(auth.jwt()->''app_metadata''->>''company_id'','''')::uuid)',
        t || '_insert', t
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((auth.jwt()->''app_metadata''->>''role'') IN (''store_admin'',''store_user'') AND company_id = nullif(auth.jwt()->''app_metadata''->>''company_id'','''')::uuid) WITH CHECK ((auth.jwt()->''app_metadata''->>''role'') IN (''store_admin'',''store_user'') AND company_id = nullif(auth.jwt()->''app_metadata''->>''company_id'','''')::uuid)',
        t || '_update', t
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((auth.jwt()->''app_metadata''->>''role'') IN (''store_admin'',''store_user'') AND company_id = nullif(auth.jwt()->''app_metadata''->>''company_id'','''')::uuid)',
        t || '_delete', t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((auth.jwt()->''app_metadata''->>''role'') IN (''store_admin'',''store_user'') AND company_id = nullif(auth.jwt()->''app_metadata''->>''company_id'','''')::uuid)',
        t || '_insert', t
      );
    END IF;
  END LOOP;
END $$;

grant select,insert,update,delete on public.device_units,public.service_orders,public.pets,public.pet_appointments,public.product_variants,public.product_batches,public.bundles,public.bundle_items,public.purchases,public.purchase_items to authenticated;
grant select,insert on public.audit_logs to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Receber compra: estoque, custo, histórico e financeiro em uma transação --------
create or replace function public.receive_purchase(p_purchase_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase record;
  v_item record;
  v_total numeric := 0;
  v_rows integer;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') then
    raise exception 'Sem permissão';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Compra não encontrada'; end if;
  if v_purchase.company_id <> nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid then
    raise exception 'Compra pertence a outra empresa';
  end if;
  if v_purchase.status = 'received' then raise exception 'Compra já recebida'; end if;
  if v_purchase.status = 'cancelled' then raise exception 'Compra cancelada'; end if;
  if not exists (select 1 from public.purchase_items where purchase_id = p_purchase_id) then
    raise exception 'Compra sem itens';
  end if;

  for v_item in select * from public.purchase_items where purchase_id = p_purchase_id loop
    v_total := v_total + (v_item.quantity * v_item.unit_cost);

    update public.products
       set stock_qty = stock_qty + v_item.quantity,
           cost = v_item.unit_cost
     where id = v_item.product_id
       and company_id = v_purchase.company_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'Produto da compra inválido'; end if;

    insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
    values(v_purchase.company_id,v_item.product_id,'entry',v_item.quantity,'Recebimento de compra','purchase',p_purchase_id,auth.uid());
  end loop;

  update public.purchases set total = v_total,status='received',received_at=now() where id=p_purchase_id;

  if v_total > 0 then
    insert into public.financial_transactions(
      company_id,transaction_type,category,description,amount,status,due_date,paid_at,supplier_id,created_by
    ) values (
      v_purchase.company_id,'expense','Compras','Compra de mercadorias #' || v_purchase.purchase_number,
      v_total,v_purchase.payment_status,current_date,
      case when v_purchase.payment_status = 'paid' then now() else null end,
      v_purchase.supplier_id,auth.uid()
    );
  end if;
end;
$$;
revoke all on function public.receive_purchase(uuid) from public,anon;
grant execute on function public.receive_purchase(uuid) to authenticated;

-- Venda de kit Sedux: baixa componentes e gera venda/financeiro sem PDV ----------
create or replace function public.create_bundle_sale(p_bundle_id uuid,p_customer_id uuid,p_payment_method text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(auth.jwt()->'app_metadata'->>'company_id','')::uuid;
  v_bundle record;
  v_component record;
  v_sale_id uuid;
  v_cost numeric := 0;
  v_component_count integer := 0;
begin
  if (auth.jwt()->'app_metadata'->>'role') not in ('store_admin','store_user') or v_company_id is null then
    raise exception 'Sem permissão';
  end if;

  select * into v_bundle from public.bundles where id=p_bundle_id and is_active=true for update;
  if not found or v_bundle.company_id <> v_company_id then raise exception 'Kit inválido'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and company_id = v_company_id and is_active = true
  ) then
    raise exception 'Cliente inválido';
  end if;

  for v_component in
    select bi.quantity,p.id,p.name,p.stock_qty,p.cost
    from public.bundle_items bi
    join public.products p on p.id=bi.product_id and p.company_id=v_company_id and p.is_active=true
    where bi.bundle_id=p_bundle_id and bi.company_id=v_company_id
  loop
    v_component_count := v_component_count + 1;
    if v_component.stock_qty < v_component.quantity then
      raise exception 'Estoque insuficiente para %',v_component.name;
    end if;
    v_cost := v_cost + (v_component.cost * v_component.quantity);
  end loop;

  if v_component_count = 0 then raise exception 'Adicione produtos ao kit antes de vender'; end if;

  insert into public.sales(company_id,customer_id,subtotal,discount,total,amount_paid,payment_method,payment_status,created_by)
  values(v_company_id,p_customer_id,v_bundle.price,0,v_bundle.price,v_bundle.price,coalesce(nullif(trim(p_payment_method),''),'Pix'),'paid',auth.uid())
  returning id into v_sale_id;

  insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost)
  values(v_company_id,v_sale_id,null,'KIT: '||v_bundle.name,1,v_bundle.price,v_bundle.price,v_cost);

  for v_component in
    select bi.quantity,p.id,p.name
    from public.bundle_items bi
    join public.products p on p.id=bi.product_id and p.company_id=v_company_id and p.is_active=true
    where bi.bundle_id=p_bundle_id and bi.company_id=v_company_id
  loop
    update public.products set stock_qty=stock_qty-v_component.quantity where id=v_component.id and company_id=v_company_id;
    insert into public.inventory_movements(company_id,product_id,movement_type,quantity,reason,reference_type,reference_id,created_by)
    values(v_company_id,v_component.id,'exit',v_component.quantity,'Venda de kit: '||v_bundle.name,'sale',v_sale_id,auth.uid());
  end loop;

  insert into public.financial_transactions(company_id,transaction_type,category,description,amount,status,paid_at,sale_id,customer_id,created_by)
  values(v_company_id,'income','Vendas','Venda de kit: '||v_bundle.name,v_bundle.price,'paid',now(),v_sale_id,p_customer_id,auth.uid());

  return v_sale_id;
end;
$$;
revoke all on function public.create_bundle_sale(uuid,uuid,text) from public,anon;
grant execute on function public.create_bundle_sale(uuid,uuid,text) to authenticated;
