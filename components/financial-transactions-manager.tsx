"use client";

import { FormEvent, useState, useTransition } from "react";
import { deleteFinancialTransaction, markFinancialPaid, updateFinancialTransaction } from "@/lib/actions";
import { brl, dateBR } from "@/lib/format";
import styles from "./financial-transactions-manager.module.css";

export type FinancialTransaction = {
  id: string; created_at: string; transaction_type: "income" | "expense";
  category: string; description: string; amount: number | string;
  status: "pending" | "paid" | "cancelled"; sale_id: string | null;
  supplier_id: string | null; cash_session_id: string | null; source_type: "manual" | "sale" | "pos" | "purchase";
};
type ActionResult = { ok: boolean; error?: string };

function dateInputValue(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
function isAutomatic(row: FinancialTransaction) {
  return row.source_type !== "manual";
}
function originLabel(row: FinancialTransaction) {
  if (row.source_type === "pos") return "PDV";
  if (row.source_type === "sale") return "Venda";
  if (row.source_type === "purchase") return "Compra";
  return "Manual";
}

export function FinancialTransactionsManager({ initialRows }: { initialRows: FinancialTransaction[] }) {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<FinancialTransaction | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const paidIncome = rows.filter((r) => r.transaction_type === "income" && r.status === "paid").reduce((a, r) => a + Number(r.amount), 0);
  const paidExpense = rows.filter((r) => r.transaction_type === "expense" && r.status === "paid").reduce((a, r) => a + Number(r.amount), 0);
  const pendingTotal = rows.filter((r) => r.status === "pending").reduce((a, r) => a + Number(r.amount), 0);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const previous = rows;
    const updated: FinancialTransaction = { ...editing,
      created_at: `${String(data.get("transaction_date"))}T12:00:00.000Z`,
      transaction_type: data.get("transaction_type") === "income" ? "income" : "expense",
      category: String(data.get("category") ?? "").trim(), description: String(data.get("description") ?? "").trim(),
      status: ["pending", "paid", "cancelled"].includes(String(data.get("status"))) ? String(data.get("status")) as FinancialTransaction["status"] : "pending",
      amount: Number(data.get("amount")),
    };
    setError(""); setRows((current) => current.map((r) => r.id === updated.id ? updated : r)); setEditing(null);
    startTransition(async () => { const result = await updateFinancialTransaction(data) as ActionResult; if (!result.ok) { setRows(previous); setError(result.error ?? "Não foi possível editar a movimentação."); } });
  }

  function remove(row: FinancialTransaction) {
    if (isAutomatic(row)) { setError("Movimentações automáticas devem ser canceladas ou estornadas no módulo de origem."); return; }
    if (!window.confirm(`Excluir a movimentação “${row.description}” no valor de ${brl(row.amount)}? Esta ação ficará registrada na auditoria.`)) return;
    const previous = rows; const data = new FormData(); data.set("id", row.id);
    setError(""); setRows((current) => current.filter((item) => item.id !== row.id));
    startTransition(async () => { const result = await deleteFinancialTransaction(data) as ActionResult; if (!result.ok) { setRows(previous); setError(result.error ?? "Não foi possível excluir a movimentação."); } });
  }

  function markPaid(row: FinancialTransaction) {
    const previous = rows; const data = new FormData(); data.set("id", row.id);
    setError(""); setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: "paid" } : item));
    startTransition(async () => { const result = await markFinancialPaid(data) as ActionResult; if (!result.ok) { setRows(previous); setError(result.error ?? "Não foi possível dar baixa na movimentação."); } });
  }


  return <>
    <div className="stat-grid">
      <div className="stat-card success"><span>Entradas realizadas</span><strong>{brl(paidIncome)}</strong><small>Movimentações pagas</small></div>
      <div className="stat-card"><span>Saídas realizadas</span><strong>{brl(paidExpense)}</strong><small>Movimentações pagas</small></div>
      <div className="stat-card success"><span>Saldo realizado</span><strong>{brl(paidIncome - paidExpense)}</strong><small>Entradas menos saídas</small></div>
      <div className={`stat-card ${pendingTotal ? "warning" : ""}`}><span>Lançamentos pendentes</span><strong>{brl(pendingTotal)}</strong><small>Aguardando baixa</small></div>
    </div>

    <section className="panel section-gap">
      <div className="panel-head"><h2>Movimentações financeiras</h2><span className="badge">{rows.length}</span></div>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <div className={`table-wrap ${styles.tableWrap}`}><table><thead><tr><th>Data</th><th>Origem</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td data-label="Data">{dateBR(row.created_at)}</td>
          <td data-label="Origem"><span className={`badge ${row.cash_session_id ? "success" : ""}`}>{originLabel(row)}</span></td>
          <td data-label="Tipo">{row.transaction_type === "income" ? "Entrada" : "Saída"}</td>
          <td data-label="Categoria">{row.category}</td><td data-label="Descrição">{row.description}</td>
          <td data-label="Status"><span className={`badge ${row.status === "paid" ? "success" : row.status === "pending" ? "warning" : "danger"}`}>{row.status === "paid" ? "Realizado" : row.status === "pending" ? "Pendente" : "Cancelado"}</span></td>
          <td data-label="Valor" className="amount">{brl(row.amount)}</td>
          <td data-label="Ações"><div className={styles.actions}>
            {row.status === "pending" ? <button type="button" className="secondary" disabled={pending} onClick={() => markPaid(row)}>Dar baixa</button> : null}
            <button type="button" className="secondary" disabled={pending} onClick={() => { setError(""); setEditing(row); }}>Editar</button>
            <button type="button" className="danger" disabled={pending || isAutomatic(row)} title={isAutomatic(row) ? "Exclua ou estorne no módulo de origem" : "Excluir movimentação"} onClick={() => remove(row)}>Excluir</button>
          </div>{isAutomatic(row) ? <small className={styles.protected}>Exclusão protegida</small> : null}</td>
        </tr>)}
        {!rows.length ? <tr><td colSpan={8} className="empty">Nenhum lançamento financeiro.</td></tr> : null}
      </tbody></table></div>
    </section>

    {editing ? <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setEditing(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="financial-edit-title">
        <div className={styles.modalHead}><div><span className="eyebrow">MOVIMENTAÇÃO FINANCEIRA</span><h2 id="financial-edit-title">Editar movimentação</h2></div><button type="button" className={styles.close} aria-label="Fechar" onClick={() => setEditing(null)}>×</button></div>
        <form className="form-grid" onSubmit={save}>
          <input type="hidden" name="id" value={editing.id} />
          <label>Data<input name="transaction_date" type="date" defaultValue={dateInputValue(editing.created_at)} required /></label>
          <label>Tipo<select name="transaction_type" defaultValue={editing.transaction_type}><option value="expense">Despesa / saída</option><option value="income">Entrada</option></select></label>
          <label>Categoria<input name="category" defaultValue={editing.category} maxLength={120} required /></label>
          <label>Status<select name="status" defaultValue={editing.status}><option value="pending">Pendente</option><option value="paid">Pago / recebido</option><option value="cancelled">Cancelado</option></select></label>
          <label className="wide">Descrição<input name="description" defaultValue={editing.description} maxLength={300} required /></label>
          <label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={Number(editing.amount)} required /></label>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="primary" disabled={pending}>Salvar alterações</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}
