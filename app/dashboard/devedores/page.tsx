import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { createReceivable, recordReceivablePayment } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { brl, dateBR } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function DebtorsPage() {
  await requireStoreUser();
  const supabase = await createClient();
  const [{ data: customers }, { data: receivables }] = await Promise.all([
    supabase.from("customers").select("id,name").eq("is_active", true).order("name"),
    supabase.from("receivables").select("*, customers(name)").order("due_date", { ascending: true }),
  ]);
  const rows = receivables ?? [];
  const open = rows.filter((r) => r.status === "open" || r.status === "partial");
  const totalOpen = open.reduce((a, r) => a + Number(r.amount_total) - Number(r.amount_paid), 0);
  const overdue = open.filter((r) => new Date(`${r.due_date}T23:59:59`) < new Date());

  return <>
    <PageHeader eyebrow="CONTAS A RECEBER" title="Clientes devedores" description="Controle vendas a prazo e outros valores que clientes ainda precisam pagar." />
    <div className="stat-grid">
      <StatCard label="Saldo a receber" value={brl(totalOpen)} tone={totalOpen ? "warning" : "default"} />
      <StatCard label="Títulos em aberto" value={String(open.length)} />
      <StatCard label="Vencidos" value={String(overdue.length)} tone={overdue.length ? "warning" : "default"} />
      <StatCard label="Clientes cadastrados" value={String(customers?.length ?? 0)} />
    </div>
    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Novo valor a receber</h2></div><div className="panel-body"><form action={createReceivable} className="form-grid">
        <label className="wide">Cliente<select name="customer_id" required><option value="">Selecione...</option>{customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="wide">Motivo<input name="description" required placeholder="Ex.: compra parcelada" /></label>
        <label>Valor total (R$)<input name="amount_total" type="number" min="0.01" step="0.01" required /></label>
        <label>Vencimento<input name="due_date" type="date" required /></label>
        <div className="form-actions"><button className="primary">Registrar dívida</button></div>
      </form></div></section>
      <section className="panel"><div className="panel-head"><h2>Como funciona</h2></div><div className="panel-body"><p className="callout">Quando uma venda for marcada como <strong>pendente</strong> ou <strong>parcial</strong>, o sistema cria automaticamente o valor a receber aqui. Você também pode incluir uma dívida manualmente.</p><p className="muted">Ao registrar um pagamento, o financeiro recebe a entrada automaticamente e o saldo do cliente é atualizado.</p></div></section>
    </div>
    <section className="panel section-gap"><div className="panel-head"><h2>Valores a receber</h2><span className="badge warning">{open.length} aberto(s)</span></div><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Descrição</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Saldo</th><th>Status</th><th>Registrar pagamento</th></tr></thead><tbody>
      {open.map((r) => { const balance = Number(r.amount_total) - Number(r.amount_paid); const isOverdue = new Date(`${r.due_date}T23:59:59`) < new Date(); return <tr key={r.id}><td><strong>{r.customers?.name ?? "Cliente"}</strong></td><td>{r.description}</td><td>{dateBR(r.due_date)}</td><td>{brl(r.amount_total)}</td><td>{brl(r.amount_paid)}</td><td className="amount">{brl(balance)}</td><td><span className={`badge ${isOverdue ? "danger" : "warning"}`}>{isOverdue ? "Vencido" : r.status === "partial" ? "Parcial" : "Em aberto"}</span></td><td><form action={recordReceivablePayment} className="inline-form"><input type="hidden" name="receivable_id" value={r.id}/><input name="amount" type="number" min="0.01" max={balance} step="0.01" required placeholder="R$"/><select name="payment_method"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Transferência</option></select><button className="secondary">Receber</button></form></td></tr>; })}
      {!open.length ? <tr><td colSpan={8} className="empty">Nenhum cliente com valor em aberto.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
