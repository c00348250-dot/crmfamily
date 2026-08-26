import { PageHeader } from "@/components/page-header";
import { requireStoreUser } from "@/lib/auth";
import { brl } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";

function saoPauloDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shortDate(key: string) {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

type ProductMetric = { name: string; quantity: number; revenue: number; profit: number };

export default async function PerformancePage() {
  await requireStoreUser();
  const supabase = await createClient();
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const { data: sales } = await supabase
    .from("sales")
    .select("id,total,amount_paid,sold_at,customer_id,customers(name)")
    .eq("status", "completed")
    .gte("sold_at", since.toISOString())
    .order("sold_at", { ascending: true });

  const list = sales ?? [];
  const saleIds = list.map((sale) => sale.id);
  const { data: saleItems } = saleIds.length
    ? await supabase.from("sale_items").select("sale_id,product_name,quantity,line_total,unit_cost,products(category)").in("sale_id", saleIds)
    : { data: [] as Array<{ sale_id: string; product_name: string; quantity: number | string; line_total: number | string; unit_cost: number | string; products?: { category?: string | null } | null }> };

  const items = saleItems ?? [];
  const revenue = list.reduce((sum, sale) => sum + Number(sale.total), 0);
  const received = list.reduce((sum, sale) => sum + Number(sale.amount_paid), 0);
  const grossProfit = items.reduce((sum, item) => sum + Number(item.line_total) - Number(item.unit_cost) * Number(item.quantity), 0);
  const averageTicket = list.length ? revenue / list.length : 0;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const productMap = new Map<string, ProductMetric>();
  for (const item of items) {
    const name = item.product_name || "Produto";
    const current = productMap.get(name) ?? { name, quantity: 0, revenue: 0, profit: 0 };
    current.quantity += Number(item.quantity);
    current.revenue += Number(item.line_total);
    current.profit += Number(item.line_total) - Number(item.unit_cost) * Number(item.quantity);
    productMap.set(name, current);
  }
  const products = [...productMap.values()];
  const topQuantity = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  const topProfit = [...products].sort((a, b) => b.profit - a.profit).slice(0, 8);

  const customerMap = new Map<string, { name: string; purchases: number; total: number }>();
  for (const sale of list) {
    const name = relationOne(sale.customers)?.name ?? "Não identificado";
    const current = customerMap.get(name) ?? { name, purchases: 0, total: 0 };
    current.purchases += 1;
    current.total += Number(sale.total);
    customerMap.set(name, current);
  }
  const topCustomers = [...customerMap.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  const categoryMap = new Map<string, { name: string; revenue: number; profit: number }>();
  for (const item of items) {
    const name = relationOne(item.products)?.category ?? (item.product_name.startsWith("KIT:") ? "Kits" : "Sem categoria");
    const current = categoryMap.get(name) ?? { name, revenue: 0, profit: 0 };
    current.revenue += Number(item.line_total);
    current.profit += Number(item.line_total) - Number(item.unit_cost) * Number(item.quantity);
    categoryMap.set(name, current);
  }
  const categories = [...categoryMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const daily = new Map<string, number>();
  for (let offset = 29; offset >= 0; offset--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    daily.set(saoPauloDateKey(date), 0);
  }
  for (const sale of list) {
    const key = saoPauloDateKey(new Date(sale.sold_at));
    daily.set(key, (daily.get(key) ?? 0) + Number(sale.total));
  }
  const dailyRows = [...daily.entries()];
  const maxDaily = Math.max(1, ...dailyRows.map(([, value]) => value));

  return <>
    <PageHeader eyebrow="GESTÃO" title="Desempenho do negócio" description="Vendas, lucro, ticket médio, produtos e clientes dos últimos 30 dias." />

    <div className="stat-grid">
      <div className="stat-card success"><span>Faturamento</span><strong>{brl(revenue)}</strong><small>Últimos 30 dias</small></div>
      <div className="stat-card"><span>Vendas</span><strong>{list.length}</strong><small>Ticket médio {brl(averageTicket)}</small></div>
      <div className="stat-card success"><span>Lucro bruto estimado</span><strong>{brl(grossProfit)}</strong><small>Margem {margin.toFixed(1)}%</small></div>
      <div className="stat-card"><span>Recebido</span><strong>{brl(received)}</strong><small>{revenue > 0 ? `${((received / revenue) * 100).toFixed(1)}% do vendido` : "Sem vendas"}</small></div>
    </div>

    <section className="panel"><div className="panel-head"><h2>Faturamento diário</h2><span className="badge">30 dias</span></div><div className="panel-body performance-chart" aria-label="Gráfico de faturamento diário">
      {dailyRows.map(([key, value]) => <div className="performance-day" key={key} title={`${shortDate(key)} — ${brl(value)}`}><div className="performance-bar-shell"><div className="performance-bar" style={{ height: `${Math.max(value > 0 ? 8 : 2, (value / maxDaily) * 100)}%` }} /></div><small>{shortDate(key)}</small></div>)}
    </div></section>

    <div className="grid-2 section-gap">
      <section className="panel"><div className="panel-head"><h2>Produtos mais vendidos</h2></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Faturamento</th></tr></thead><tbody>
        {topQuantity.map((product) => <tr key={product.name}><td><strong>{product.name}</strong></td><td>{product.quantity.toLocaleString("pt-BR")}</td><td className="amount">{brl(product.revenue)}</td></tr>)}
        {!topQuantity.length ? <tr><td colSpan={3} className="empty">Sem vendas no período.</td></tr> : null}
      </tbody></table></div></section>

      <section className="panel"><div className="panel-head"><h2>Produtos mais lucrativos</h2></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Lucro bruto</th><th>Margem</th></tr></thead><tbody>
        {topProfit.map((product) => <tr key={product.name}><td><strong>{product.name}</strong></td><td className="amount">{brl(product.profit)}</td><td>{product.revenue > 0 ? `${((product.profit / product.revenue) * 100).toFixed(1)}%` : "—"}</td></tr>)}
        {!topProfit.length ? <tr><td colSpan={3} className="empty">Sem dados de lucro no período.</td></tr> : null}
      </tbody></table></div></section>
    </div>

    <div className="grid-2 section-gap">
      <section className="panel"><div className="panel-head"><h2>Clientes que mais compraram</h2></div><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Compras</th><th>Total</th></tr></thead><tbody>
        {topCustomers.map((customer) => <tr key={customer.name}><td><strong>{customer.name}</strong></td><td>{customer.purchases}</td><td className="amount">{brl(customer.total)}</td></tr>)}
        {!topCustomers.length ? <tr><td colSpan={3} className="empty">Sem clientes no período.</td></tr> : null}
      </tbody></table></div></section>

      <section className="panel"><div className="panel-head"><h2>Desempenho por categoria</h2></div><div className="table-wrap"><table><thead><tr><th>Categoria</th><th>Faturamento</th><th>Lucro bruto</th></tr></thead><tbody>
        {categories.map((category) => <tr key={category.name}><td><strong>{category.name}</strong></td><td className="amount">{brl(category.revenue)}</td><td>{brl(category.profit)}</td></tr>)}
        {!categories.length ? <tr><td colSpan={3} className="empty">Sem categorias com venda no período.</td></tr> : null}
      </tbody></table></div></section>
    </div>
  </>;
}
