"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";
import type { CashSessionSummary } from "@/modules/pos/pos.types";
import styles from "./sessionControls.module.css";

export function SessionControls({ session }: { session: CashSessionSummary | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function post(url: string, payload: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir a operação.");
      return body;
    } finally {
      setLoading(false);
    }
  }

  async function openCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await post("/api/pos/sessions", {
        action: "open",
        openingAmount: data.get("openingAmount"),
        notes: data.get("notes"),
      });
      setNotice("Caixa aberto com sucesso.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao abrir caixa.");
    }
  }

  async function movement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await post("/api/pos/movements", {
        sessionId: session.id,
        movementType: data.get("movementType"),
        amount: data.get("amount"),
        description: data.get("description"),
      });
      form.reset();
      setNotice("Movimento registrado.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao registrar movimento.");
    }
  }

  async function closeCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!window.confirm("Confirmar fechamento do caixa? Depois do fechamento, novas vendas exigirão uma nova abertura.")) return;
    try {
      const body = await post("/api/pos/sessions", {
        action: "close",
        sessionId: session.id,
        closingAmount: data.get("closingAmount"),
        notes: data.get("notes"),
      });
      const summary = body.summary as { expected?: number; counted?: number; difference?: number } | undefined;
      const difference = Number(summary?.difference ?? 0);
      setNotice(`Caixa fechado. Diferença apurada: ${brl(difference)}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao fechar caixa.");
    }
  }

  if (!session) {
    return (
      <section className={styles.closedPanel}>
        <div className={styles.closedCopy}>
          <span className={styles.eyebrow}>INÍCIO DO TURNO</span>
          <h1>Abra o caixa para começar</h1>
          <p>Informe quanto existe fisicamente em dinheiro no caixa. Vendas, sangrias e suprimentos serão conciliados a partir desse valor.</p>
        </div>
        <form className={styles.openForm} onSubmit={openCash}>
          <label>Valor inicial em dinheiro (R$)<input name="openingAmount" type="number" min="0" step="0.01" defaultValue="0" required /></label>
          <label>Observação do turno<textarea name="notes" placeholder="Opcional" rows={3} /></label>
          {error ? <p className={styles.error}>{error}</p> : null}
          {notice ? <p className={styles.notice}>{notice}</p> : null}
          <button type="submit" disabled={loading}>{loading ? "Abrindo..." : "Abrir caixa"}</button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.metrics}>
        <article><small>Fundo inicial</small><strong>{brl(session.openingAmount)}</strong></article>
        <article><small>Vendas do turno</small><strong>{brl(session.totalSales)}</strong><span>{session.saleCount} venda(s)</span></article>
        <article><small>Dinheiro recebido</small><strong>{brl(session.cashSales)}</strong></article>
        <article className={styles.expected}><small>Esperado em caixa</small><strong>{brl(session.expectedCash)}</strong><span>Suprimentos − saídas incluídos</span></article>
      </div>

      <details className={styles.operations}>
        <summary>Operações de caixa <span>Sangria, suprimento e fechamento</span></summary>
        <div className={styles.operationGrid}>
          <form onSubmit={movement}>
            <div className={styles.formTitle}><strong>Movimentar dinheiro</strong><small>Movimentos ficam registrados na auditoria.</small></div>
            <label>Tipo<select name="movementType" defaultValue="withdrawal"><option value="withdrawal">Sangria / retirada</option><option value="supply">Suprimento / entrada</option></select></label>
            <label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label className={styles.wide}>Motivo<input name="description" placeholder="Ex.: retirada para cofre" required /></label>
            <button type="submit" disabled={loading}>Registrar movimento</button>
          </form>

          <form onSubmit={closeCash}>
            <div className={styles.formTitle}><strong>Fechar caixa</strong><small>Conte o dinheiro físico antes de confirmar.</small></div>
            <label>Valor contado (R$)<input name="closingAmount" type="number" min="0" step="0.01" required /></label>
            <label className={styles.wide}>Observação<input name="notes" placeholder="Opcional" /></label>
            <button className={styles.closeButton} type="submit" disabled={loading}>Fechar e conferir</button>
          </form>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}
      </details>
    </section>
  );
}
