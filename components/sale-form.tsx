"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";

type Product = { id: string; name: string; price: number | string; stock_qty: number | string };
type Customer = { id: string; name: string };
type Item = { product_id: string; quantity: number };

export function SaleForm({ products, customers }: { products: Product[]; customers: Customer[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([{ product_id: "", quantity: 1 }]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [amountPaid, setAmountPaid] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const subtotal = useMemo(() => items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.product_id);
    return sum + Number(product?.price ?? 0) * Number(item.quantity || 0);
  }, 0), [items, products]);
  const total = Math.max(0, subtotal - discount);

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (!validItems.length) { setError("Adicione ao menos um produto."); setLoading(false); return; }
    if ((paymentStatus === "partial" || paymentStatus === "pending") && !customerId) {
      setError("Venda a prazo precisa ter um cliente identificado."); setLoading(false); return;
    }

    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId || null,
        discount,
        paymentMethod,
        paymentStatus,
        amountPaid: paymentStatus === "paid" ? total : paymentStatus === "pending" ? 0 : amountPaid,
        dueDate: dueDate || null,
        items: validItems,
      }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Não foi possível registrar a venda."); setLoading(false); return; }

    setSuccess(`Venda registrada com sucesso. Código ${String(body.saleId).slice(0, 8)}.`);
    setItems([{ product_id: "", quantity: 1 }]); setCustomerId(""); setDiscount(0); setAmountPaid(0); setDueDate("");
    setLoading(false); router.refresh();
  }

  return <form className="sale-builder" onSubmit={submit}>
    <label>Cliente<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Venda sem cadastro / à vista</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Forma de pagamento<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência</option><option>Outro</option></select></label>
    <label>Situação<select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="paid">Pago</option><option value="partial">Pagamento parcial</option><option value="pending">Pendente / fiado</option></select></label>
    <label>Desconto (R$)<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></label>
    {paymentStatus === "partial" ? <label>Valor pago agora (R$)<input type="number" min="0.01" max={total} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} required /></label> : null}
    {paymentStatus !== "paid" ? <label>Vencimento<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label> : null}

    <div className="sale-items">
      <strong>Itens da venda</strong>
      {items.map((item, index) => {
        const selected = products.find((p) => p.id === item.product_id);
        return <div className="sale-item-row" key={index}>
          <label>Produto<select value={item.product_id} onChange={(e) => updateItem(index, { product_id: e.target.value })} required><option value="">Selecione...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} — {brl(p.price)} — estoque {p.stock_qty}</option>)}</select></label>
          <label>Qtd.<input type="number" min="0.001" step="0.001" max={Number(selected?.stock_qty ?? 999999)} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} /></label>
          <div><small className="muted">Subtotal</small><div className="amount">{brl(Number(selected?.price ?? 0) * item.quantity)}</div></div>
          <button className="danger" type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} disabled={items.length === 1}>Remover</button>
        </div>;
      })}
      <div><button className="secondary" type="button" onClick={() => setItems((current) => [...current, { product_id: "", quantity: 1 }])}>+ Adicionar item</button></div>
    </div>
    <div className="sale-total"><span>Subtotal: <strong>{brl(subtotal)}</strong></span><span>Total: <strong>{brl(total)}</strong></span></div>
    {error ? <p className="form-error">{error}</p> : null}
    {success ? <p className="access-result">{success}</p> : null}
    <div className="form-actions"><button className="primary" disabled={loading}>{loading ? "Registrando..." : "Concluir venda"}</button></div>
  </form>;
}
