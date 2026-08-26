"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; sku: string; stock_qty: number | string; cost: number | string };
type PurchaseItem = { product_id: string; quantity: number; unit_cost: number };

export function PurchaseForm({ suppliers, products }: { suppliers: Supplier[]; products: Product[] }) {
  const router = useRouter();
  const [items, setItems] = useState<PurchaseItem[]>([{ product_id: "", quantity: 1, unit_cost: 0 }]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderedAt, setOrderedAt] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0), [items]);

  function patchItem(index: number, patch: Partial<PurchaseItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    patchItem(index, { product_id: productId, unit_cost: Number(product?.cost ?? 0) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const validItems = items.filter((item) => item.product_id && item.quantity > 0 && item.unit_cost >= 0);
    if (!validItems.length || validItems.length !== items.length) {
      setError("Preencha corretamente todos os itens da compra.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: supplierId || null,
        invoiceNumber: invoiceNumber || null,
        orderedAt: orderedAt || null,
        paymentStatus,
        notes: notes || null,
        items: validItems,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Não foi possível registrar a compra.");
      setLoading(false);
      return;
    }

    setSuccess(`Compra #${body.purchaseNumber ?? ""} registrada. Receba a mercadoria quando ela chegar.`);
    setItems([{ product_id: "", quantity: 1, unit_cost: 0 }]);
    setSupplierId("");
    setInvoiceNumber("");
    setOrderedAt("");
    setPaymentStatus("pending");
    setNotes("");
    setLoading(false);
    router.refresh();
  }

  return <form className="purchase-builder" onSubmit={submit}>
    <div className="form-grid">
      <label>Fornecedor<select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Não informado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label>Nota / documento<input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></label>
      <label>Data do pedido<input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} /></label>
      <label>Pagamento<select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="pending">Pendente</option><option value="paid">Pago</option></select></label>
      <label className="wide">Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    </div>

    <div className="purchase-items section-gap">
      <div className="panel-head compact"><h3>Itens da compra</h3><button type="button" className="secondary" onClick={() => setItems((current) => [...current, { product_id: "", quantity: 1, unit_cost: 0 }])}>+ Adicionar produto</button></div>
      {items.map((item, index) => {
        const product = products.find((p) => p.id === item.product_id);
        return <div className="purchase-item-row" key={index}>
          <label>Produto<select value={item.product_id} onChange={(e) => selectProduct(index, e.target.value)} required><option value="">Selecione...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} — estoque {p.stock_qty}</option>)}</select></label>
          <label>Quantidade<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => patchItem(index, { quantity: Number(e.target.value) })} required /></label>
          <label>Custo unitário<input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => patchItem(index, { unit_cost: Number(e.target.value) })} required /></label>
          <div className="purchase-line-total"><small className="muted">Subtotal</small><strong>{brl(item.quantity * item.unit_cost)}</strong>{product ? <small className="muted">Custo atual {brl(product.cost)}</small> : null}</div>
          <button type="button" className="danger" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} disabled={items.length === 1}>Remover</button>
        </div>;
      })}
    </div>

    <div className="purchase-total"><span>Total da compra</span><strong>{brl(total)}</strong></div>
    {error ? <p className="form-error">{error}</p> : null}
    {success ? <div className="access-result">{success}</div> : null}
    <div className="form-actions"><button className="primary" disabled={loading}>{loading ? "Registrando..." : "Registrar compra"}</button></div>
  </form>;
}
