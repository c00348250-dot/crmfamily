-- CRM Family - venda avulsa de serviços no PDV - 2026-09-01
-- Execute depois de supabase/finance-management-2026-08-27.sql.
-- Permite ao /caixa vender serviços lançados na hora, sem produto cadastrado e sem baixa de estoque.

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
  v_service_name text;
  v_service_description text;
  v_service_price numeric;
  v_service_cost numeric;
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
      select x->>'source_type' as source_type, x->>'source_id' as source_id, x->>'service_name' as service_name, count(*)
      from jsonb_array_elements(p_items) x
      where x->>'source_type' <> 'manual_service'
      group by 1,2,3 having count(*) > 1
    ) duplicated
  ) then raise exception 'Existem itens duplicados no carrinho'; end if;

  -- Primeira passagem: valida tudo e calcula subtotal. Nenhuma baixa ocorre antes disso.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_source_type := v_item->>'source_type';
    begin
      v_qty := (v_item->>'quantity')::numeric;
      v_source_id := case when v_source_type = 'manual_service' then null else (v_item->>'source_id')::uuid end;
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

    elsif v_source_type = 'manual_service' then
      v_service_name := nullif(trim(v_item->>'service_name'), '');
      begin
        v_service_price := (v_item->>'unit_price')::numeric;
        v_service_cost := coalesce(nullif(v_item->>'unit_cost','')::numeric,0);
      exception when others then
        raise exception 'Servico invalido';
      end;
      if v_service_name is null then raise exception 'Informe o nome do servico'; end if;
      if v_service_price <= 0 then raise exception 'Valor do servico deve ser maior que zero'; end if;
      if v_service_cost < 0 then raise exception 'Custo do servico invalido'; end if;
      v_subtotal := v_subtotal + v_service_price*v_qty;
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
    v_source_id := case when v_source_type = 'manual_service' then null else (v_item->>'source_id')::uuid end;
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

    elsif v_source_type = 'manual_service' then
      v_service_name := nullif(trim(v_item->>'service_name'), '');
      v_service_description := nullif(trim(coalesce(v_item->>'service_description','')), '');
      v_service_price := (v_item->>'unit_price')::numeric;
      v_service_cost := coalesce(nullif(v_item->>'unit_cost','')::numeric,0);
      insert into public.sale_items(company_id,sale_id,product_id,product_name,quantity,unit_price,line_total,unit_cost,source_type,source_id)
      values(v_company_id,v_sale_id,null,
        'Servico - '||v_service_name||coalesce(' - '||v_service_description,''),
        v_qty,v_service_price,v_service_price*v_qty,v_service_cost,'manual_service',null);
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

revoke all on function public.create_pos_sale(uuid,uuid,numeric,date,jsonb,jsonb) from public,anon;
grant execute on function public.create_pos_sale(uuid,uuid,numeric,date,jsonb,jsonb) to authenticated;
