import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FinancialTransactionsManager, type FinancialTransaction } from "@/components/financial-transactions-manager";
import { createFinancialTransaction } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { brl, dateBR } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function cashMovementLabel(type: string) {
  if (type === "withdrawal") return "Sangria";
  if (type === "supply") return "Suprimento";
  if (type === "refund") return "Estorno";
  return type;
}

export default async function FinancePage() {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const [{ data: rows }, { data: cashMovements }, { data: cashSessions }] = await Promise.all([
    supabase.from("financial_transactions").select("id,created_at,due_date,transaction_type,category,description,amount,status,sale_id,supplier_id,cash_session_id,source_type").eq("company_id", auth.companyId!).order("created_at", { ascending: false }).limit(200),
    supabase.from("cash_movements").select("id,movement_type,amount,description,created_at,cash_session_id,sale_id").eq("company_id", auth.companyId!).order("created_at", { ascending: false }).limit(100),
    supabase.from("cash_sessions").select("id,status,opening_amount,expected_amount,closing_amount,difference,opened_at,closed_at").eq("company_id", auth.companyId!).order("opened_at", { ascending: false }).limit(30),
  ]);

  const list = rows ?? [];
  const pdvMovements = cashMovements ?? [];
  const sessions = cashSessions ?? [];
  const withdrawals = pdvMovements.filter((row) => row.movement_type === "withdrawal").reduce((a, row) => a + Number(row.amount), 0);
  const supplies = pdvMovements.filter((row) => row.movement_type === "supply").reduce((a, row) => a + Number(row.amount), 0);

  return <>
    <PageHeader eyebrow="CAIXA" title="Financeiro" description="Controle entradas, despesas e também acompanhe tudo que acontece no PDV da empresa." />

    <section className="panel"><div className="panel-head"><h2>Novo lançamento</h2></div><div className="panel-body"><form action={createFinancialTransaction} className="form-grid">
      <label>Tipo<select name="transaction_type"><option value="expense">Despesa / saída</option><option value="income">Entrada</option></select></label>
      <label>Status<select name="status"><option value="pending">Pendente</option><option value="paid">Pago / recebido</option></select></label>
      <label>Categoria<input name="category" required placeholder="Aluguel, compra, serviços..." /></label>
      <label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label className="wide">Descrição<input name="description" required /></label>
      <label>Vencimento<input name="due_date" type="date" /></label>
      <div className="form-actions"><button className="primary">Adicionar lançamento</button></div>
    </form></div></section>

    <FinancialTransactionsManager key={list.map((row) => row.id).join(",")} initialRows={list as FinancialTransaction[]} />

    <section className="panel section-gap">
      <div className="panel-head"><h2>Movimentos do PDV</h2><span className="badge">{pdvMovements.length}</span></div>
      <div className="panel-body">
        <div className="stat-grid">
          <StatCard label="Sangrias registradas" value={brl(withdrawals)} tone={withdrawals ? "warning" : "default"} />
          <StatCard label="Suprimentos registrados" value={brl(supplies)} tone={supplies ? "success" : "default"} />
          <StatCard label="Sessões de caixa" value={String(sessions.length)} />
          <StatCard label="Caixas abertos" value={String(sessions.filter((session) => session.status === "open").length)} tone={sessions.some((session) => session.status === "open") ? "success" : "default"} />
        </div>
        <p className="callout section-gap">Sangria e suprimento representam movimentação física do caixa. Eles ficam visíveis no CRM, mas não são tratados automaticamente como despesa ou receita da empresa.</p>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Operação</th><th>Descrição</th><th>Caixa</th><th>Valor</th></tr></thead><tbody>
        {pdvMovements.map((movement) => <tr key={movement.id}><td>{dateBR(movement.created_at)}</td><td><span className={`badge ${movement.movement_type === "supply" ? "success" : movement.movement_type === "withdrawal" ? "warning" : ""}`}>{cashMovementLabel(movement.movement_type)}</span></td><td>{movement.description}</td><td><small>{String(movement.cash_session_id).slice(0, 8)}</small></td><td className="amount">{brl(movement.amount)}</td></tr>)}
        {!pdvMovements.length ? <tr><td colSpan={5} className="empty">Nenhuma sangria, suprimento ou estorno registrado no PDV.</td></tr> : null}
      </tbody></table></div>
    </section>

    <section className="panel section-gap"><div className="panel-head"><h2>Sessões recentes do caixa</h2><span className="badge">{sessions.length}</span></div><div className="table-wrap"><table><thead><tr><th>Abertura</th><th>Status</th><th>Fundo inicial</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>
      {sessions.map((session) => <tr key={session.id}><td>{dateBR(session.opened_at)}</td><td><span className={`badge ${session.status === "open" ? "success" : ""}`}>{session.status === "open" ? "Aberto" : "Fechado"}</span></td><td>{brl(session.opening_amount)}</td><td>{session.expected_amount == null ? "—" : brl(session.expected_amount)}</td><td>{session.closing_amount == null ? "—" : brl(session.closing_amount)}</td><td>{session.difference == null ? "—" : brl(session.difference)}</td></tr>)}
      {!sessions.length ? <tr><td colSpan={6} className="empty">Nenhuma sessão de caixa registrada.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
