import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { createFinancialTransaction, markFinancialPaid } from "@/lib/actions";
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
  await requireStoreUser();
  const supabase = await createClient();
  const [{ data: rows }, { data: cashMovements }, { data: cashSessions }] = await Promise.all([
    supabase.from("financial_transactions").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("cash_movements").select("id,movement_type,amount,description,created_at,cash_session_id,sale_id").order("created_at", { ascending: false }).limit(100),
    supabase.from("cash_sessions").select("id,status,opening_amount,expected_amount,closing_amount,difference,opened_at,closed_at").order("opened_at", { ascending: false }).limit(30),
  ]);

  const list = rows ?? [];
  const pdvMovements = cashMovements ?? [];
  const sessions = cashSessions ?? [];
  const paidIncome = list.filter((r) => r.transaction_type === "income" && r.status === "paid").reduce((a, r) => a + Number(r.amount), 0);
  const paidExpense = list.filter((r) => r.transaction_type === "expense" && r.status === "paid").reduce((a, r) => a + Number(r.amount), 0);
  const pending = list.filter((r) => r.status === "pending").reduce((a, r) => a + Number(r.amount), 0);
  const withdrawals = pdvMovements.filter((row) => row.movement_type === "withdrawal").reduce((a, row) => a + Number(row.amount), 0);
  const supplies = pdvMovements.filter((row) => row.movement_type === "supply").reduce((a, row) => a + Number(row.amount), 0);

  return <>
    <PageHeader eyebrow="CAIXA" title="Financeiro" description="Controle entradas, despesas e também acompanhe tudo que acontece no PDV da empresa." />
    <div className="stat-grid">
      <StatCard label="Entradas realizadas" value={brl(paidIncome)} tone="success" />
      <StatCard label="Saídas realizadas" value={brl(paidExpense)} />
      <StatCard label="Saldo realizado" value={brl(paidIncome - paidExpense)} tone="success" />
      <StatCard label="Lançamentos pendentes" value={brl(pending)} tone={pending ? "warning" : "default"} />
    </div>

    <section className="panel"><div className="panel-head"><h2>Novo lançamento</h2></div><div className="panel-body"><form action={createFinancialTransaction} className="form-grid">
      <label>Tipo<select name="transaction_type"><option value="expense">Despesa / saída</option><option value="income">Entrada</option></select></label>
      <label>Status<select name="status"><option value="pending">Pendente</option><option value="paid">Pago / recebido</option></select></label>
      <label>Categoria<input name="category" required placeholder="Aluguel, compra, serviços..." /></label>
      <label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label className="wide">Descrição<input name="description" required /></label>
      <label>Vencimento<input name="due_date" type="date" /></label>
      <div className="form-actions"><button className="primary">Adicionar lançamento</button></div>
    </form></div></section>

    <section className="panel section-gap"><div className="panel-head"><h2>Movimentações financeiras</h2><span className="badge">{list.length}</span></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Origem</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody>
      {list.map((r) => <tr key={r.id}><td>{dateBR(r.created_at)}</td><td><span className={`badge ${r.cash_session_id ? "success" : ""}`}>{r.cash_session_id ? "PDV" : "CRM"}</span></td><td>{r.transaction_type === "income" ? "Entrada" : "Saída"}</td><td>{r.category}</td><td>{r.description}</td><td><span className={`badge ${r.status === "paid" ? "success" : r.status === "pending" ? "warning" : ""}`}>{r.status === "paid" ? "Realizado" : r.status === "pending" ? "Pendente" : "Cancelado"}</span></td><td className="amount">{brl(r.amount)}</td><td>{r.status === "pending" ? <form action={markFinancialPaid}><input type="hidden" name="id" value={r.id}/><button className="secondary">Dar baixa</button></form> : null}</td></tr>)}
      {!list.length ? <tr><td colSpan={8} className="empty">Nenhum lançamento financeiro.</td></tr> : null}
    </tbody></table></div></section>

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
