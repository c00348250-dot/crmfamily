import { PageHeader } from "@/components/page-header";
import { PurchaseForm } from "@/components/purchase-form";
import { requireStoreUser } from "@/lib/auth";
import { brl, dateBR } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";
import { receivePurchase } from "@/lib/specialized-actions";

export default async function PurchasesPage() {
  await requireStoreUser();
  const supabase = await createClient();
  const [{ data: suppliers }, { data: products }, { data: purchases }] = await Promise.all([
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name,sku,stock_qty,min_stock,cost").eq("is_active", true).order("name"),
    supabase.from("purchases").select("id,purchase_number,invoice_number,status,total,payment_status,ordered_at,received_at,notes,suppliers(name),purchase_items(quantity,unit_cost,products(name,sku))").order("created_at", { ascending: false }).limit(100),
  ]);

  const ordered = (purchases ?? []).filter((p) => p.status === "ordered");
  const low = (products ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_stock));
  const receivedTotal = (purchases ?? []).filter((p) => p.status === "received").reduce((a,p) => a + Number(p.total), 0);

  return <>
    <PageHeader eyebrow="REPOSIÇÃO" title="Compras" description="Registre compras com vários produtos e receba mercadorias com atualização automática do estoque, custo e financeiro." />

    <div className="stat-grid">
      <div className="stat-card warning"><span>Aguardando recebimento</span><strong>{ordered.length}</strong><small>Pedidos abertos</small></div>
      <div className={`stat-card ${low.length ? "warning" : "success"}`}><span>Itens para repor</span><strong>{low.length}</strong><small>No estoque mínimo</small></div>
      <div className="stat-card"><span>Compras registradas</span><strong>{purchases?.length ?? 0}</strong><small>Últimos lançamentos</small></div>
      <div className="stat-card"><span>Total recebido</span><strong>{brl(receivedTotal)}</strong><small>Compras concluídas</small></div>
    </div>

    {low.length ? <section className="stock-alert"><div className="stock-alert-icon">!</div><div className="stock-alert-copy"><strong>Sugestão de reposição</strong><p>{low.length} produto(s) estão no estoque mínimo ou abaixo dele. Use a lista abaixo para priorizar a compra.</p></div><span className="stock-alert-count">{low.length}</span></section> : null}

    <div className="grid-2 purchases-layout">
      <section className="panel"><div className="panel-head"><h2>Nova compra</h2></div><div className="panel-body">
        <PurchaseForm suppliers={suppliers ?? []} products={products ?? []} />
        <p className="callout section-gap">O estoque só é alterado ao clicar em <strong>Receber mercadoria</strong>. Nesse momento o sistema registra todas as entradas, atualiza o custo dos produtos e lança a compra no financeiro.</p>
      </div></section>

      <section className="panel"><div className="panel-head"><h2>Prioridade de reposição</h2><span className="badge warning">{low.length}</span></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Atual</th><th>Mínimo</th><th>Falta p/ mínimo</th></tr></thead><tbody>
        {low.map((p) => <tr key={p.id} className="low-stock-row"><td><strong>{p.name}</strong></td><td>{p.sku}</td><td>{p.stock_qty}</td><td>{p.min_stock}</td><td>{Math.max(0, Number(p.min_stock) - Number(p.stock_qty))}</td></tr>)}
        {!low.length ? <tr><td colSpan={5} className="empty">Estoque em ordem.</td></tr> : null}
      </tbody></table></div></section>
    </div>

    <section className="panel section-gap"><div className="panel-head"><h2>Histórico de compras</h2><span className="badge">{purchases?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>Compra</th><th>Pedido</th><th>Fornecedor</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Ação</th></tr></thead><tbody>
      {purchases?.map((p) => <tr key={p.id}><td><strong>#{p.purchase_number}</strong>{p.invoice_number ? <small className="stock-row-note">Doc. {p.invoice_number}</small> : null}</td><td>{dateBR(p.ordered_at)}</td><td>{relationOne(p.suppliers)?.name ?? "—"}</td><td>{p.purchase_items?.map((i) => `${i.quantity}× ${relationOne(i.products)?.name ?? "Produto"}`).join(", ") || "—"}</td><td className="amount">{brl(p.total)}</td><td><span className={`badge ${p.payment_status === "paid" ? "success" : "warning"}`}>{p.payment_status === "paid" ? "Pago" : "Pendente"}</span></td><td><span className={`badge ${p.status === "received" ? "success" : p.status === "cancelled" ? "danger" : "warning"}`}>{p.status === "received" ? "Recebida" : p.status === "ordered" ? "Aguardando" : p.status}</span></td><td>{p.status === "ordered" ? <form action={receivePurchase}><input type="hidden" name="id" value={p.id}/><button className="primary">Receber mercadoria</button></form> : <span className="muted">Concluída</span>}</td></tr>)}
      {!purchases?.length ? <tr><td colSpan={8} className="empty">Nenhuma compra registrada.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
