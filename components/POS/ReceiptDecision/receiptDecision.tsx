"use client";

import { useState } from "react";
import type { PosReceipt } from "@/modules/pos/pos.types";
import { Receipt } from "@/components/POS/Receipt/receipt";
import styles from "./receiptDecision.module.css";

export function ReceiptDecision({ receipt }: { receipt: PosReceipt }) {
  const [asking, setAsking] = useState(true);

  function printReceipt() {
    setAsking(false);
    requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 80);
    });
  }

  function skipReceipt() {
    window.close();
  }

  return (
    <div className={styles.wrapper}>
      <Receipt receipt={receipt} />

      {asking ? (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="receipt-decision-title">
          <section className={styles.modal}>
            <span className={styles.eyebrow}>VENDA CONCLUÍDA</span>
            <div className={styles.icon} aria-hidden="true">✓</div>
            <h1 id="receipt-decision-title">Deseja imprimir o comprovante da venda?</h1>
            <p>
              A venda <strong>#{receipt.saleNumber}</strong> foi registrada com sucesso. Você pode imprimir agora um comprovante interno para o cliente.
            </p>

            <div className={styles.notice}>
              <strong>Comprovante de venda — NÃO FISCAL</strong>
              <span>Este documento não substitui NF-e ou NFC-e.</span>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.printButton} onClick={printReceipt}>
                Sim, imprimir
              </button>
              <button type="button" className={styles.skipButton} onClick={skipReceipt}>
                Não imprimir
              </button>
            </div>

            <small>
              A emissão fiscal poderá ser adicionada neste mesmo fluxo quando o certificado digital da empresa estiver configurado.
            </small>
          </section>
        </div>
      ) : null}
    </div>
  );
}
