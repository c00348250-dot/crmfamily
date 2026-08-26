"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl } from "@/lib/format";
import type { CashSessionSummary, PosHistorySale } from "@/modules/pos/pos.types";
import styles from "./history.module.css";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

const paymentStatus: Record<string, string> = {
  paid: "Pago",
  partial: "Parcial",
  pending: "Pendente",
};

export function History({ sales, session }: { sales: PosHistorySale[]; session: CashSessionSummary | null }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function cancelSale(sale: PosHistorySale) {
    if (!session) {
      setError("Abra um caixa antes de registrar cancelamentos ou estornos.");
      return;
    }
    const reason = window.prompt(`Motivo do cancelamento/estorno da venda #${sale.saleNumber}:`);
    if (!reason?.trim()) return;
    if (!window.confirm(`Confirmar cancelamento da venda #${sale.saleNumber}? Estoque, financeiro e eventual agenda/OS serão revertidos.`)) return;

    setLoadingId(sale.id);
    setError("");
    try {
      const response = await fetch(`/api/pos/sales/${sale.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, refundSessionId: session.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível cancelar a venda.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro ao cancelar a venda.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>RASTREABILIDADE DO BALCÃO</span>
          <h1>Histórico do caixa</h1>
          <p>Vendas do PDV com comprovante interno, situação de pagamento e cancelamento/estorno auditado.</p>
        </div>
        <Link href="/caixa">Nova venda</Link>
      </header>

      {!session ? <div className={styles.warning}>O caixa está fechado. O histórico permanece disponível, mas estornos que movimentem dinheiro exigem uma sessão aberta.</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.list}>
        {sales.map((sale) => (
          <article className={`${styles.sale} ${sale.status === "cancelled" ? styles.cancelled : ""}`} key={sale.id}>
            <div className={styles.number}><small>VENDA</small><strong>#{sale.saleNumber}</strong></div>
            <div className={styles.info}><strong>{sale.customerName}</strong><span>{dateTime(sale.soldAt)}</span></div>
            <div><small>Pagamento</small><strong>{paymentStatus[sale.paymentStatus] ?? sale.paymentStatus}</strong></div>
            <div><small>Recebido</small><strong>{brl(sale.amountPaid)}</strong></div>
            <div className={styles.total}><small>Total</small><strong>{brl(sale.total)}</strong></div>
            <div className={styles.status}><span>{sale.status === "cancelled" ? "Cancelada / estornada" : "Concluída"}</span></div>
            <div className={styles.actions}>
              <Link href={`/caixa/comprovante/${sale.id}`} target="_blank">Comprovante</Link>
              {sale.status === "completed" ? (
                <button type="button" onClick={() => cancelSale(sale)} disabled={loadingId === sale.id || !session}>
                  {loadingId === sale.id ? "Processando..." : "Cancelar / estornar"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!sales.length ? <div className={styles.empty}>Nenhuma venda foi registrada pela Frente de Caixa ainda.</div> : null}
      </section>
    </div>
  );
}
