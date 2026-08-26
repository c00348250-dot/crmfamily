import { PageHeader } from "@/components/page-header";
import { SaleForm } from "@/components/sale-form";
import { StatCard } from "@/components/stat-card";
import { requireStoreUser } from "@/lib/auth";
import { brl, dateBR } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";

export default async function SalesPage() {
  await requireStoreUser();
  const supabase = await createClient();
  const [{ data: products }, { data: customers }, { data: sales }] = await Promise.all([
    supabase.from("products").select("id,name,price,stock_qty").eq("is_active", true).gt("stock_qty", 0).order("name"),
    supabase.from("customers").select("id,name").eq("is_active", true).order("name"),
    supabase.from("sales").select("id,sale_number,total,amount_paid,payment_method,payment_status,sold_at,source,cash_session_id,customers(name)").eq("status", "completed").order("sold_at", { ascending: false }).limit(100),
  ]);
  const list = sales ?? [];
  const total = list.reduce((a, s) => a + Number(s.total), 0);
  const received = list.reduce((a, s) => a + Number(s.amount_paid), 0);
  const open = total - received;
  const pdvSales = list.filter((sale) => sale.source === "pos");

  return <>
    <PageHeader eyebrow="COMERCIAL" title="Vendas" description="Vendas do CRM e do PDV da empresa aparecem juntas e atualizam estoque, financeiro e clientes devedores." />
    <div className="stat-grid">
      <StatCard label="Vendas listadas" value={String(list.length)} />
      <StatCard label="Vendas pelo PDV" value={String(pdvSales.length)} tone={pdvSales.length ? "success" : "default"} />
      <StatCard label="Valor vendido" value={brl(total)} />
      <StatCard label="Valor recebido" value={brl(received)} tone="success" />
      <StatCard label="Saldo a receber" value={brl(open)} tone={open > 0 ? "warning" : "default"} />
    </div>
    <section className="panel"><div className="panel-head"><h2>Nova venda</h2></div><div className="panel-body"><SaleForm products={(products ?? []) as never[]} customers={(customers ?? []) as never[]} /></div></section>
    <section className="panel section-gap"><div className="panel-head"><h2>Histórico de vendas</h2><span className="badge">{list.length}</span></div><div className="table-wrap"><table><thead><tr><th>Venda</th><th>Origem</th><th>Data</th><th>Cliente</th><th>Forma</th><th>Situação</th><th>Recebido</th><th>Total</th></tr></thead><tbody>
      {list.map((s) => <tr key={s.id}><td><strong>#{s.sale_number}</strong></td><td><span className={`badge ${s.source === "pos" ? "success" : ""}`}>{s.source === "pos" ? "PDV" : "CRM"}</span></td><td>{dateBR(s.sold_at)}</td><td>{relationOne(s.customers)?.name ?? "Não identificado"}</td><td>{s.payment_method ?? "—"}</td><td><span className={`badge ${s.payment_status === "paid" ? "success" : "warning"}`}>{s.payment_status === "paid" ? "Pago" : s.payment_status === "partial" ? "Parcial" : "Pendente"}</span></td><td>{brl(s.amount_paid)}</td><td className="amount">{brl(s.total)}</td></tr>)}
      {!list.length ? <tr><td colSpan={8} className="empty">Nenhuma venda registrada.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
