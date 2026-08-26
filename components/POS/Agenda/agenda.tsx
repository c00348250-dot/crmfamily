import Link from "next/link";
import { brl } from "@/lib/format";
import type { PosAgendaItem } from "@/modules/pos/pos.types";
import styles from "./agenda.module.css";

const statusLabels: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_service: "Em atendimento",
  ready: "Pronto para receber",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function time(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export function Agenda({ brandKey, brandName, items }: { brandKey: string; brandName: string; items: PosAgendaItem[] }) {
  const housePet = brandKey === "housepet";
  const schemmer = brandKey === "schemmer";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>OPERAÇÃO DO BALCÃO</span>
          <h1>{housePet ? "Agenda de hoje" : schemmer ? "Prontos para retirada" : "Agenda operacional"}</h1>
          <p>{housePet
            ? "A mesma agenda criada dentro do CRM, disponível no caixa sem liberar acesso ao painel administrativo."
            : schemmer
              ? "Ordens de serviço finalizadas pelo CRM e aguardando recebimento no balcão."
              : `O ${brandName} não possui agenda operacional configurada para o caixa neste momento.`}</p>
        </div>
        <Link href="/caixa">Voltar ao PDV</Link>
      </header>

      {(housePet || schemmer) ? (
        <section className={styles.list}>
          {items.map((item) => (
            <article className={`${styles.item} ${item.readyToCharge ? styles.ready : ""}`} key={`${item.sourceType}:${item.id}`}>
              <div className={styles.timeBox}>
                <small>{item.scheduledAt ? "HORÁRIO" : "STATUS"}</small>
                <strong>{item.scheduledAt ? time(item.scheduledAt) : "PRONTO"}</strong>
              </div>
              <div className={styles.mainCopy}>
                <span>{item.title}</span>
                <h2>{item.subject}</h2>
                <p>{item.customerName}{item.customerPhone ? ` • ${item.customerPhone}` : ""}</p>
              </div>
              <div className={styles.statusBox}>
                <small>Situação</small>
                <strong>{statusLabels[item.status] ?? item.status}</strong>
              </div>
              <div className={styles.priceBox}>
                <small>Valor</small>
                <strong>{brl(item.price)}</strong>
              </div>
              <div className={styles.actionBox}>
                {item.readyToCharge ? (
                  <Link href={`/caixa?sourceType=${item.sourceType}&sourceId=${item.id}`}>Receber no caixa</Link>
                ) : (
                  <span>{item.status === "delivered" ? "Já recebido" : "Aguardando conclusão"}</span>
                )}
              </div>
            </article>
          ))}
          {!items.length ? <div className={styles.empty}>{housePet ? "Nenhum atendimento na agenda de hoje." : "Nenhuma ordem pronta para retirada."}</div> : null}
        </section>
      ) : (
        <section className={styles.emptyState}>
          <strong>Sem agenda para esta operação</strong>
          <p>O acesso do caixa continua disponível para vendas, recebimentos, sangria, suprimento e histórico.</p>
          <Link href="/caixa">Abrir frente de caixa</Link>
        </section>
      )}
    </div>
  );
}
