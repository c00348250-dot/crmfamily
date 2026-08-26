import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { relationOne } from "@/lib/supabase/relation";

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return "\ufeff" + [headers, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
}

export async function GET(request: Request) {
  await requireSuperAdmin();
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "sales";
  const companyId = url.searchParams.get("companyId");
  const supabase = await createClient();
  const companies = await supabase.from("companies").select("id,name");
  const names = new Map((companies.data ?? []).map((c) => [c.id, c.name]));
  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (type === "sales") {
    let q = supabase.from("sales").select("company_id,sale_number,sold_at,total,amount_paid,payment_method,payment_status,customers(name)").order("sold_at", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Venda","Data","Cliente","Total","Recebido","Forma","Situação"];
    rows = (data ?? []).map((r) => [names.get(r.company_id), r.sale_number, r.sold_at, relationOne(r.customers)?.name ?? "", r.total, r.amount_paid, r.payment_method, r.payment_status]);
  } else if (type === "profit") {
    let q = supabase.from("sale_items").select("company_id,sale_id,product_name,quantity,unit_price,line_total,unit_cost,sales(sale_number,sold_at)").order("id", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Venda","Data","Produto/Kit","Quantidade","Receita","Custo unitário","Custo total","Lucro bruto","Margem %"];
    rows = (data ?? []).map((r) => {
      const sale = relationOne(r.sales);
      const revenue = Number(r.line_total ?? 0);
      const cost = Number(r.unit_cost ?? 0) * Number(r.quantity ?? 0);
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return [names.get(r.company_id), sale?.sale_number ?? "", sale?.sold_at ?? "", r.product_name, r.quantity, revenue, r.unit_cost, cost, profit, margin.toFixed(2)];
    });
  } else if (type === "customers") {
    let q = supabase.from("customers").select("company_id,name,document,phone,email,address,is_active").order("name");
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Cliente","Documento","Telefone","E-mail","Endereço","Ativo"];
    rows = (data ?? []).map((r) => [names.get(r.company_id), r.name, r.document, r.phone, r.email, r.address, r.is_active ? "Sim" : "Não"]);
  } else if (type === "finance") {
    let q = supabase.from("financial_transactions").select("company_id,created_at,transaction_type,category,description,amount,status,due_date").order("created_at", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Data","Tipo","Categoria","Descrição","Valor","Status","Vencimento"];
    rows = (data ?? []).map((r) => [names.get(r.company_id), r.created_at, r.transaction_type, r.category, r.description, r.amount, r.status, r.due_date]);
  } else if (type === "suppliers") {
    let q = supabase.from("suppliers").select("company_id,name,document,contact_name,phone,email,is_active").order("name");
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Fornecedor","Documento","Contato","Telefone","E-mail","Ativo"];
    rows = (data ?? []).map((r) => [names.get(r.company_id), r.name, r.document, r.contact_name, r.phone, r.email, r.is_active ? "Sim" : "Não"]);
  } else if (type === "stock" || type === "low-stock") {
    let q = supabase.from("products").select("company_id,sku,name,category,cost,price,stock_qty,min_stock,is_active").order("name");
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    const list = type === "low-stock" ? (data ?? []).filter((r) => Number(r.stock_qty) <= Number(r.min_stock)) : (data ?? []);
    headers = ["Empresa","SKU","Produto","Categoria","Custo","Preço","Estoque","Mínimo","Ativo"];
    rows = list.map((r) => [names.get(r.company_id), r.sku, r.name, r.category, r.cost, r.price, r.stock_qty, r.min_stock, r.is_active ? "Sim" : "Não"]);
  } else if (type === "debtors") {
    let q = supabase.from("receivables").select("company_id,description,amount_total,amount_paid,due_date,status,customers(name)").order("due_date");
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Cliente","Descrição","Total","Pago","Saldo","Vencimento","Status"];
    rows = (data ?? []).map((r) => [names.get(r.company_id), relationOne(r.customers)?.name ?? "", r.description, r.amount_total, r.amount_paid, Number(r.amount_total)-Number(r.amount_paid), r.due_date, r.status]);
  } else if (type === "purchases") {
    let q = supabase.from("purchases").select("company_id,purchase_number,invoice_number,ordered_at,received_at,status,total,payment_status,suppliers(name),purchase_items(quantity,unit_cost,products(name,sku))").order("created_at", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Compra","Documento","Pedido","Recebimento","Fornecedor","Itens","Total","Pagamento","Status"];
    rows = (data ?? []).map((r) => [
      names.get(r.company_id),
      r.purchase_number,
      r.invoice_number,
      r.ordered_at,
      r.received_at,
      relationOne(r.suppliers)?.name ?? "",
      r.purchase_items?.map((i) => {
        const product = relationOne(i.products);
        return `${i.quantity}x ${product?.name ?? "Produto"} @ ${i.unit_cost}`;
      }).join(" | ") ?? "",
      r.total,
      r.payment_status,
      r.status,
    ]);
  } else if (type === "audit") {
    let q = supabase.from("audit_logs").select("company_id,user_id,action,entity_type,entity_id,details,created_at").order("created_at", { ascending: false }).limit(5000);
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    headers = ["Empresa","Data","Usuário ID","Ação","Entidade","Entidade ID","Detalhes"];
    rows = (data ?? []).map((r) => [names.get(r.company_id), r.created_at, r.user_id, r.action, r.entity_type, r.entity_id, r.details ? JSON.stringify(r.details) : ""]);
  } else {
    return new Response("Tipo de relatório inválido", { status: 400 });
  }

  const csv = toCsv(headers, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crmfamily-${type}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
