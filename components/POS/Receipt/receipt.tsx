"use client";

import { brl } from "@/lib/format";
import type { PosPaymentMethod, PosReceipt } from "@/modules/pos/pos.types";
import styles from "./receipt.module.css";

const paymentLabels: Record<PosPaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  transfer: "Transferência",
  other: "Outro",
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function Receipt({ receipt }: { receipt: PosReceipt }) {
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => window.print()}>Imprimir comprovante</button>
        <button type="button" onClick={() => window.close()}>Fechar</button>
      </div>

      <article className={styles.receipt}>
        <header>
          <strong>{receipt.companyName}</strong>
          <span>{receipt.companyLabel}</span>
          <h1>Comprovante interno</h1>
          <small>NÃO FISCAL</small>
        </header>

        <section className={styles.meta}>
          <div><span>Venda</span><strong>#{receipt.saleNumber}</strong></div>
          <div><span>Data</span><strong>{dateTime(receipt.soldAt)}</strong></div>
          <div><span>Cliente</span><strong>{receipt.customerName}</strong></div>
          <div><span>Situação</span><strong>{receipt.status === "cancelled" ? "CANCELADA / ESTORNADA" : "CONCLUÍDA"}</strong></div>
        </section>

        <section className={styles.items}>
          <div className={styles.rowHead}><span>Item</span><span>Qtd.</span><span>Total</span></div>
          {receipt.items.map((item) => (
            <div className={styles.item} key={item.id}>
              <div><strong>{item.name}</strong><small>{brl(item.unitPrice)} / un.</small></div>
              <span>{item.quantity.toLocaleString("pt-BR")}</span>
              <strong>{brl(item.lineTotal)}</strong>
            </div>
          ))}
        </section>

        <section className={styles.totals}>
          <div><span>Subtotal</span><strong>{brl(receipt.subtotal)}</strong></div>
          {receipt.discount > 0 ? <div><span>Desconto</span><strong>− {brl(receipt.discount)}</strong></div> : null}
          <div className={styles.grandTotal}><span>Total</span><strong>{brl(receipt.total)}</strong></div>
          <div><span>Recebido</span><strong>{brl(receipt.amountPaid)}</strong></div>
          {receipt.total > receipt.amountPaid ? <div><span>Saldo a receber</span><strong>{brl(receipt.total - receipt.amountPaid)}</strong></div> : null}
        </section>

        <section className={styles.payments}>
          <strong>Pagamentos</strong>
          {receipt.payments.map((payment) => (
            <div key={payment.id}>
              <span>{paymentLabels[payment.method] ?? payment.method}{payment.status === "refunded" ? " — estornado" : ""}</span>
              <strong>{brl(payment.amount)}</strong>
            </div>
          ))}
          {!receipt.payments.length ? <div><span>A prazo / pendente</span><strong>{brl(0)}</strong></div> : null}
        </section>

        <footer>
          <p>Documento de controle interno. Não substitui documento fiscal quando este for exigido.</p>
          <small>ID {receipt.saleId}</small>
        </footer>
      </article>
    </div>
  );
}
