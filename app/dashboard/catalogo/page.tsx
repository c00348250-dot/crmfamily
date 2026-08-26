import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireStoreUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { brl, dateBR } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";
import { addBundleItem, adjustVariantStock, createBundle, createProductBatch, createProductVariant, sellBundle } from "@/lib/specialized-actions";

export default async function CatalogPage() {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name,slug").eq("id", auth.companyId!).single();
  if (getCompanyBrand(company?.slug, company?.name).key !== "sedux") redirect("/dashboard");

  const [{ data: products }, { data: variants }, { data: batches }, { data: bundles }, { data: bundleItems }, { data: customers }] = await Promise.all([
    supabase.from("products").select("id,name,sku,price,cost,stock_qty").eq("is_active", true).order("name"),
    supabase.from("product_variants").select("id,sku,color,size,model,flavor,volume,stock_qty,min_stock,price_override,products(name,price)").eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("product_batches").select("id,lot_number,expires_at,quantity,notes,products(name)").order("expires_at", { ascending: true }),
    supabase.from("bundles").select("id,name,sku,price,description").eq("is_active", true).order("name"),
    supabase.from("bundle_items").select("id,bundle_id,quantity,products(name,stock_qty,cost)"),
    supabase.from("customers").select("id,name").eq("is_active", true).order("name"),
  ]);

  const soon = new Date(); soon.setDate(soon.getDate() + 60);
  const expiring = (batches ?? []).filter((b) => new Date(`${b.expires_at}T12:00:00`) <= soon);
  const lowVariants = (variants ?? []).filter((v) => Number(v.stock_qty) <= Number(v.min_stock));

  return <>
    <PageHeader eyebrow="SEDUX" title="Variações, kits e validade" description="Controle de tamanhos, cores, lotes, validade e kits com baixa automática dos componentes." />

    <div className="stat-grid">
      <div className="stat-card"><span>Variações</span><strong>{variants?.length ?? 0}</strong><small>Tamanhos, cores e modelos</small></div>
      <div className={`stat-card ${lowVariants.length ? "warning" : "success"}`}><span>Variações em reposição</span><strong>{lowVariants.length}</strong><small>Estoque mínimo</small></div>
      <div className={`stat-card ${expiring.length ? "warning" : "success"}`}><span>Validade próxima</span><strong>{expiring.length}</strong><small>Próximos 60 dias</small></div>
      <div className="stat-card"><span>Kits ativos</span><strong>{bundles?.length ?? 0}</strong><small>Venda combinada</small></div>
    </div>

    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Nova variação</h2></div><div className="panel-body"><form action={createProductVariant} className="form-grid">
        <label className="wide">Produto base<select name="product_id" required><option value="">Selecione...</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>SKU da variação<input name="sku" required /></label><label>Cor<input name="color" /></label><label>Tamanho<input name="size" /></label><label>Modelo<input name="model" /></label><label>Sabor<input name="flavor" /></label><label>Volume<input name="volume" /></label><label>Estoque<input name="stock_qty" type="number" min="0" step="0.001" defaultValue="0" /></label><label>Estoque mínimo<input name="min_stock" type="number" min="0" step="0.001" defaultValue="0" /></label><label>Preço específico (R$)<input name="price_override" type="number" min="0" step="0.01" /></label>
        <div className="form-actions"><button className="primary">Cadastrar variação</button></div>
      </form></div></section>

      <section className="panel"><div className="panel-head"><h2>Lote e validade</h2></div><div className="panel-body"><form action={createProductBatch} className="form-grid">
        <label className="wide">Produto<select name="product_id" required><option value="">Selecione...</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Lote<input name="lot_number" /></label><label>Validade<input name="expires_at" type="date" required /></label><label>Quantidade<input name="quantity" type="number" min="0" step="0.001" defaultValue="0" /></label><label className="wide">Observações<textarea name="notes" /></label><div className="form-actions"><button className="secondary">Registrar lote</button></div>
      </form></div></section>
    </div>

    <div className="grid-2 section-gap">
      <section className="panel"><div className="panel-head"><h2>Criar kit</h2></div><div className="panel-body"><form action={createBundle} className="form-grid">
        <label>Nome<input name="name" required /></label><label>SKU<input name="sku" required /></label><label>Preço do kit (R$)<input name="price" type="number" min="0" step="0.01" required /></label><label className="wide">Descrição<textarea name="description" /></label><div className="form-actions"><button className="primary">Criar kit</button></div>
      </form></div></section>

      <section className="panel"><div className="panel-head"><h2>Adicionar produto ao kit</h2></div><div className="panel-body"><form action={addBundleItem} className="form-grid">
        <label className="wide">Kit<select name="bundle_id" required><option value="">Selecione...</option>{bundles?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="wide">Produto<select name="product_id" required><option value="">Selecione...</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name} — estoque {p.stock_qty}</option>)}</select></label><label>Quantidade<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label><div className="form-actions"><button className="secondary">Adicionar componente</button></div>
      </form></div></section>
    </div>

    <section className="panel section-gap"><div className="panel-head"><h2>Venda rápida de kit</h2><span className="badge success">baixa automática</span></div><div className="panel-body"><form action={sellBundle} className="form-grid">
      <label>Kit<select name="bundle_id" required><option value="">Selecione...</option>{bundles?.map((b) => <option key={b.id} value={b.id}>{b.name} — {brl(b.price)}</option>)}</select></label><label>Cliente<select name="customer_id"><option value="">Não identificado</option>{customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Pagamento<select name="payment_method"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option></select></label><div className="form-actions"><button className="primary">Registrar venda do kit</button></div>
    </form><p className="callout section-gap">Ao vender o kit, o sistema baixa cada produto componente do estoque e registra a venda e o financeiro normalmente.</p></div></section>

    <section className="panel section-gap"><div className="panel-head"><h2>Variações cadastradas</h2><span className={`badge ${lowVariants.length ? "warning" : "success"}`}>{variants?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Cor</th><th>Tamanho</th><th>Outros</th><th>Preço</th><th>Estoque</th><th>Ajuste</th></tr></thead><tbody>
      {variants?.map((v) => { const product = relationOne(v.products); const low = Number(v.stock_qty) <= Number(v.min_stock); return <tr key={v.id} className={low ? "low-stock-row" : ""}><td><strong>{product?.name ?? "—"}</strong></td><td>{v.sku}</td><td>{v.color ?? "—"}</td><td>{v.size ?? "—"}</td><td>{[v.model,v.flavor,v.volume].filter(Boolean).join(" • ") || "—"}</td><td>{brl(v.price_override ?? product?.price ?? 0)}</td><td><span className={`badge ${low ? "warning" : "success"}`}>{v.stock_qty} / mín. {v.min_stock}</span></td><td><form action={adjustVariantStock} className="inline-form"><input type="hidden" name="variant_id" value={v.id}/><input name="quantity_change" type="number" step="0.001" placeholder="+/-" required/><button className="secondary">Ajustar</button></form></td></tr>; })}
      {!variants?.length ? <tr><td colSpan={8} className="empty">Nenhuma variação cadastrada.</td></tr> : null}
    </tbody></table></div></section>

    <section className="panel section-gap"><div className="panel-head"><h2>Lotes e validade</h2><span className={`badge ${expiring.length ? "warning" : "success"}`}>{expiring.length} próximo(s)</span></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Quantidade</th><th>Status</th><th>Observação</th></tr></thead><tbody>
      {batches?.map((b) => { const near = new Date(`${b.expires_at}T12:00:00`) <= soon; const expired = new Date(`${b.expires_at}T12:00:00`) < new Date(); return <tr key={b.id} className={near ? "low-stock-row" : ""}><td><strong>{relationOne(b.products)?.name ?? "—"}</strong></td><td>{b.lot_number ?? "—"}</td><td>{dateBR(b.expires_at)}</td><td>{b.quantity}</td><td><span className={`badge ${expired ? "danger" : near ? "warning" : "success"}`}>{expired ? "Vencido" : near ? "Validade próxima" : "Normal"}</span></td><td>{b.notes ?? "—"}</td></tr>; })}
      {!batches?.length ? <tr><td colSpan={6} className="empty">Nenhum lote com validade cadastrado.</td></tr> : null}
    </tbody></table></div></section>

    <section className="panel section-gap"><div className="panel-head"><h2>Kits</h2><span className="badge">{bundles?.length ?? 0}</span></div><div className="bundle-grid panel-body">
      {bundles?.map((b) => { const items = (bundleItems ?? []).filter((i) => i.bundle_id === b.id); const cost = items.reduce((a,i) => a + Number(i.quantity) * Number(relationOne(i.products)?.cost ?? 0), 0); return <article className="company-card" key={b.id}><span className="eyebrow">KIT</span><h3>{b.name}</h3><p>{b.description ?? "Sem descrição"}</p><div className="metrics"><div><small>Preço</small><strong>{brl(b.price)}</strong></div><div><small>Custo estimado</small><strong>{brl(cost)}</strong></div></div><div className="bundle-items">{items.map((i) => <small key={i.id}>{i.quantity}× {relationOne(i.products)?.name ?? "Produto"}</small>)}{!items.length ? <small>Nenhum componente adicionado.</small> : null}</div></article>; })}
    </div></section>
  </>;
}
