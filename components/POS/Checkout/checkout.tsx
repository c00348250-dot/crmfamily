"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";
import type { PosCartItem, PosCatalogItem, PosCustomer, PosPaymentMethod } from "@/modules/pos/pos.types";
import styles from "./checkout.module.css";

type PaymentRow = { id: number; method: PosPaymentMethod; amount: number };
type ServiceForm = {
  name: string;
  description: string;
  quantity: number;
  price: number;
  cost: number;
};

const paymentLabels: Record<PosPaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  transfer: "Transferência",
  other: "Outro",
};

function toCart(item: PosCatalogItem): PosCartItem {
  return {
    key: item.key,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    name: item.name,
    subtitle: item.subtitle,
    price: item.price,
    quantity: 1,
    maxQuantity: Math.max(1, item.stock),
    customerId: item.customerId,
    customerName: item.customerName,
  };
}

function serviceCartItem(form: ServiceForm): PosCartItem {
  const now = Date.now();
  return {
    key: `manual_service:${now}:${Math.random().toString(36).slice(2)}`,
    sourceType: "manual_service",
    sourceId: `manual-service-${now}`,
    name: form.name,
    subtitle: form.description || "Serviço avulso",
    price: form.price,
    quantity: form.quantity,
    maxQuantity: 999999,
    serviceDescription: form.description || null,
    unitCost: form.cost,
  };
}

function sourceLabel(sourceType: PosCatalogItem["sourceType"] | PosCartItem["sourceType"]) {
  if (sourceType === "device_unit") return "IMEI";
  if (sourceType === "variant") return "VARIAÇÃO";
  if (sourceType === "bundle") return "KIT";
  if (sourceType === "service_order") return "OS";
  if (sourceType === "pet_appointment") return "AGENDA";
  if (sourceType === "manual_service") return "SERVIÇO";
  return "PRODUTO";
}

export function Checkout({
  catalog,
  customers,
  sessionId,
  preselectedItem,
}: {
  catalog: PosCatalogItem[];
  customers: PosCustomer[];
  sessionId: string;
  preselectedItem?: PosCatalogItem | null;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<PosCartItem[]>(() => preselectedItem ? [toCart(preselectedItem)] : []);
  const [customerId, setCustomerId] = useState(preselectedItem?.customerId ?? "");
  const [discount, setDiscount] = useState(0);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [cashReceived, setCashReceived] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ message: string; saleId: string } | null>(null);
  const [paymentSeed, setPaymentSeed] = useState(1);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState<ServiceForm>({ name: "", description: "", quantity: 1, price: 0, cost: 0 });

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const total = Math.max(0, subtotal - Math.max(0, discount));
  const paid = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments]);
  const remaining = Math.max(0, total - paid);
  const cashAllocated = payments.filter((payment) => payment.method === "cash").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const change = Math.max(0, cashReceived - cashAllocated);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return catalog.slice(0, 18);
    return catalog.filter((item) => {
      const haystack = [item.name, item.subtitle, item.sku, item.barcode].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return haystack.includes(normalized);
    }).slice(0, 24);
  }, [catalog, query]);

  function addItem(item: PosCatalogItem) {
    setError("");
    setSuccess(null);
    setCart((current) => {
      const existing = current.find((row) => row.key === item.key);
      if (!existing) return [...current, toCart(item)];
      if (existing.quantity >= existing.maxQuantity) return current;
      return current.map((row) => row.key === item.key ? { ...row, quantity: row.quantity + 1 } : row);
    });
    if (item.customerId) setCustomerId(item.customerId);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => current.map((item) => item.key === key
      ? { ...item, quantity: Math.max(0.001, Math.min(item.maxQuantity, quantity || 1)) }
      : item));
  }

  function removeItem(key: string) {
    setCart((current) => current.filter((item) => item.key !== key));
  }

  function updateServiceForm(patch: Partial<ServiceForm>) {
    setServiceForm((current) => ({ ...current, ...patch }));
  }

  function addService() {
    setError("");
    setSuccess(null);

    const name = serviceForm.name.trim();
    const description = serviceForm.description.trim();
    const quantity = Number(serviceForm.quantity || 0);
    const price = Number(serviceForm.price || 0);
    const cost = Number(serviceForm.cost || 0);

    if (!name) {
      setError("Informe o nome do serviço.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Informe uma quantidade válida para o serviço.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("Informe um valor de venda maior que zero para o serviço.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError("Informe um custo válido para o serviço.");
      return;
    }

    setCart((current) => [...current, serviceCartItem({ name, description, quantity, price, cost })]);
    setServiceForm({ name: "", description: "", quantity: 1, price: 0, cost: 0 });
    setServiceModalOpen(false);
  }

  function exactSearch() {
    const value = query.trim().toLocaleLowerCase("pt-BR");
    if (!value) return;
    const exact = catalog.find((item) => item.barcode?.toLocaleLowerCase("pt-BR") === value || item.sku?.toLocaleLowerCase("pt-BR") === value);
    if (exact) {
      addItem(exact);
      setQuery("");
      return;
    }
    if (results.length === 1) {
      addItem(results[0]);
      setQuery("");
    }
  }

  function fullPayment(method: PosPaymentMethod) {
    if (total <= 0) return;
    setPayments([{ id: paymentSeed, method, amount: total }]);
    setPaymentSeed((seed) => seed + 1);
    setCashReceived(method === "cash" ? total : 0);
  }

  function setOnAccount() {
    setPayments([]);
    setCashReceived(0);
  }

  function addPayment() {
    const amount = Math.max(0, remaining);
    setPayments((current) => [...current, { id: paymentSeed, method: "cash", amount }]);
    setPaymentSeed((seed) => seed + 1);
    if (!cashReceived) setCashReceived(amount);
  }

  function updatePayment(id: number, patch: Partial<PaymentRow>) {
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...patch } : payment));
  }

  function removePayment(id: number) {
    setPayments((current) => current.filter((payment) => payment.id !== id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(null);

    if (!cart.length) {
      setError("Adicione ao menos um item ao carrinho.");
      return;
    }
    if (discount > subtotal) {
      setError("O desconto não pode ser maior que o subtotal.");
      return;
    }
    if (paid > total + 0.009) {
      setError("Os pagamentos ultrapassam o total da venda.");
      return;
    }
    if (remaining > 0.009 && !customerId) {
      setError("Para deixar saldo pendente, identifique o cliente.");
      return;
    }
    if (cashAllocated > 0 && cashReceived < cashAllocated) {
      setError("O valor recebido em dinheiro é menor que a parcela em dinheiro.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          customerId: customerId || null,
          discount,
          dueDate: dueDate || null,
          items: cart.map((item) => ({
            source_type: item.sourceType,
            source_id: item.sourceType === "manual_service" ? null : item.sourceId,
            quantity: item.quantity,
            service_name: item.sourceType === "manual_service" ? item.name : undefined,
            service_description: item.sourceType === "manual_service" ? item.serviceDescription : undefined,
            unit_price: item.sourceType === "manual_service" ? item.price : undefined,
            unit_cost: item.sourceType === "manual_service" ? (item.unitCost ?? 0) : undefined,
          })),
          payments: payments.filter((payment) => payment.amount > 0).map((payment) => ({
            payment_method: payment.method,
            amount: payment.amount,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir a venda.");

      const sale = body.sale as { sale_id?: string; sale_number?: number | string };
      const saleId = String(sale.sale_id ?? "");
      const saleNumber = String(sale.sale_number ?? "");
      setSuccess({ message: `Venda #${saleNumber} concluída com sucesso.`, saleId });
      setCart([]);
      setCustomerId("");
      setDiscount(0);
      setPayments([]);
      setCashReceived(0);
      setDueDate("");
      setQuery("");
      setServiceForm({ name: "", description: "", quantity: 1, price: 0, cost: 0 });
      setServiceModalOpen(false);
      router.refresh();

      if (saleId) window.open(`/caixa/comprovante/${saleId}`, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro inesperado ao concluir a venda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.workspace} onSubmit={submit}>
      <section className={styles.catalogPanel}>
        <div className={styles.sectionHeader}>
          <div><span>CATÁLOGO</span><h1>Venda rápida</h1></div>
          <button type="button" className={styles.serviceButton} onClick={() => setServiceModalOpen(true)}>+ Venda de serviço</button>
        </div>

        <div className={styles.catalogActions}>
          <button type="button" className={styles.serviceButton} onClick={() => setServiceModalOpen(true)}>+ Venda de serviço</button>
          <small>{catalog.length} produto(s), kits e itens cadastrados disponíveis</small>
        </div>

        <div className={styles.searchBox}>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                exactSearch();
              }
            }}
            placeholder="Buscar por produto, SKU, código de barras ou IMEI..."
            autoFocus
            inputMode="search"
          />
          <button type="button" onClick={exactSearch}>Adicionar</button>
        </div>

        <div className={styles.catalogGrid}>
          {results.map((item) => (
            <button type="button" className={styles.catalogItem} key={item.key} onClick={() => addItem(item)}>
              <span className={styles.catalogType}>{sourceLabel(item.sourceType)}</span>
              <strong>{item.name}</strong>
              <small>{item.subtitle}</small>
              <div><b>{brl(item.price)}</b><span>{item.stock >= 999999 ? "Kit" : `${item.stock.toLocaleString("pt-BR")} disponível`}</span></div>
            </button>
          ))}
          {!results.length ? <div className={styles.emptyCatalog}>Nenhum item encontrado para “{query}”.</div> : null}
        </div>
      </section>

      {serviceModalOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="service-sale-title">
          <div className={styles.serviceModal}>
            <div className={styles.modalHead}>
              <div><span>VENDA DE SERVIÇO</span><strong id="service-sale-title">Lançar serviço avulso</strong></div>
              <button type="button" onClick={() => setServiceModalOpen(false)} aria-label="Fechar venda de serviço">×</button>
            </div>

            <div className={styles.serviceForm}>
              <label className={styles.wide}>Serviço realizado<input value={serviceForm.name} onChange={(event) => updateServiceForm({ name: event.target.value })} required placeholder="Ex.: Troca de tela, consultoria, banho avulso..." /></label>
              <label>Quantidade<input type="number" min="0.001" step="0.001" value={serviceForm.quantity} onChange={(event) => updateServiceForm({ quantity: Number(event.target.value) })} required /></label>
              <label>Valor de venda (R$)<input type="number" min="0.01" step="0.01" value={serviceForm.price} onChange={(event) => updateServiceForm({ price: Number(event.target.value) })} required /></label>
              <label>Custo do serviço (R$)<input type="number" min="0" step="0.01" value={serviceForm.cost} onChange={(event) => updateServiceForm({ cost: Number(event.target.value) })} /></label>
              <label className={styles.wide}>Descrição / observações<textarea value={serviceForm.description} onChange={(event) => updateServiceForm({ description: event.target.value })} placeholder="Detalhes do atendimento para aparecer no CRM e no comprovante." /></label>
              <div className={styles.servicePreview}><span>Total do serviço</span><strong>{brl(Math.max(0, Number(serviceForm.quantity || 0)) * Math.max(0, Number(serviceForm.price || 0)))}</strong></div>
              <div className={styles.modalActions}><button type="button" onClick={() => setServiceModalOpen(false)}>Cancelar</button><button type="button" onClick={addService}>Adicionar ao carrinho</button></div>
            </div>
          </div>
        </div>
      ) : null}

      <aside className={styles.checkoutPanel}>
        <div className={styles.checkoutHead}>
          <div><span>VENDA ATUAL</span><strong>{cart.length} item(ns)</strong></div>
          {cart.length ? <button type="button" onClick={() => setCart([])}>Limpar</button> : null}
        </div>

        <div className={styles.cart}>
          {cart.map((item) => (
            <article className={styles.cartItem} key={item.key}>
              <div className={styles.cartCopy}>
                <strong>{item.name}</strong>
                <small><span className={styles.cartType}>{sourceLabel(item.sourceType)}</span>{item.subtitle}</small>
                <span>{brl(item.price)} / un.</span>
              </div>
              <div className={styles.quantityBox}>
                <button type="button" onClick={() => updateQuantity(item.key, item.quantity - 1)} disabled={item.maxQuantity === 1}>−</button>
                <input
                  aria-label={`Quantidade de ${item.name}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  max={item.maxQuantity}
                  value={item.quantity}
                  disabled={item.maxQuantity === 1}
                  onChange={(event) => updateQuantity(item.key, Number(event.target.value))}
                />
                <button type="button" onClick={() => updateQuantity(item.key, item.quantity + 1)} disabled={item.quantity >= item.maxQuantity}>+</button>
              </div>
              <strong className={styles.lineTotal}>{brl(item.price * item.quantity)}</strong>
              <button className={styles.remove} type="button" onClick={() => removeItem(item.key)} aria-label={`Remover ${item.name}`}>×</button>
            </article>
          ))}
          {!cart.length ? <div className={styles.emptyCart}><b>Carrinho vazio</b><span>Busque um item ao lado ou leia um código de barras.</span></div> : null}
        </div>

        <div className={styles.customerArea}>
          <label>Cliente
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Consumidor não identificado</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ""}</option>)}
            </select>
          </label>
          <label>Desconto (R$)<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label>
        </div>

        <div className={styles.totals}>
          <span>Subtotal <b>{brl(subtotal)}</b></span>
          {discount > 0 ? <span>Desconto <b>− {brl(discount)}</b></span> : null}
          <strong>Total <b>{brl(total)}</b></strong>
        </div>

        <div className={styles.quickPayments}>
          <span>Pagamento rápido</span>
          <div>
            <button type="button" onClick={() => fullPayment("pix")}>Pix</button>
            <button type="button" onClick={() => fullPayment("cash")}>Dinheiro</button>
            <button type="button" onClick={() => fullPayment("debit_card")}>Débito</button>
            <button type="button" onClick={() => fullPayment("credit_card")}>Crédito</button>
            <button type="button" onClick={setOnAccount}>A prazo</button>
          </div>
        </div>

        <div className={styles.paymentRows}>
          <div className={styles.paymentTitle}><strong>Pagamentos</strong><button type="button" onClick={addPayment}>+ Misto</button></div>
          {payments.map((payment) => (
            <div className={styles.paymentRow} key={payment.id}>
              <select value={payment.method} onChange={(event) => updatePayment(payment.id, { method: event.target.value as PosPaymentMethod })}>
                {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input aria-label="Valor do pagamento" type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => updatePayment(payment.id, { amount: Number(event.target.value) })} />
              <button type="button" onClick={() => removePayment(payment.id)} aria-label="Remover pagamento">×</button>
            </div>
          ))}
          {!payments.length ? <small className={styles.pendingText}>Sem pagamento imediato. O saldo ficará pendente para o cliente identificado.</small> : null}
        </div>

        {cashAllocated > 0 ? (
          <div className={styles.cashBox}>
            <label>Dinheiro recebido<input type="number" min={cashAllocated} step="0.01" value={cashReceived} onChange={(event) => setCashReceived(Number(event.target.value))} /></label>
            <div><span>Troco</span><strong>{brl(change)}</strong></div>
          </div>
        ) : null}

        {remaining > 0.009 ? (
          <div className={styles.creditBox}>
            <div><span>Saldo a receber</span><strong>{brl(remaining)}</strong></div>
            <label>Vencimento<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{success.message} <Link href={`/caixa/comprovante/${success.saleId}`} target="_blank">Abrir comprovante</Link></p> : null}

        <button className={styles.finishButton} type="submit" disabled={loading || !cart.length}>
          <span>{loading ? "Processando venda..." : "Concluir venda"}</span>
          <strong>{brl(total)}</strong>
        </button>
        <small className={styles.nonFiscal}>Comprovante interno não fiscal • estoque e financeiro integrados</small>
      </aside>
    </form>
  );
}
