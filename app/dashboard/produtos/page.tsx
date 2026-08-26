import { PageHeader } from "@/components/page-header";
import { SchemmerProductForm } from "@/components/SchemmerProductForm/schemmerProductForm";
import { adjustStock, archiveProduct, createProduct } from "@/lib/actions";
import { adjustSchemmerVariantStock } from "@/lib/schemmer-product-actions";
import { requireStoreUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { brl } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function ProductsPage() {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const [{ data: company }, { data: products }, { data: variants }] = await Promise.all([
    supabase.from("companies").select("name,slug").eq("id", auth.companyId!).single(),
    supabase.from("products").select("*").eq("is_active", true).order("name"),
    supabase.from("product_variants").select("id,product_id,sku,color,model,stock_qty,min_stock,price_override,is_active").eq("is_active", true).order("created_at", { ascending: false }),
  ]);

  const brand = getCompanyBrand(company?.slug, company?.name);
  const isSchemmer = brand.key === "schemmer";
  const rows = products ?? [];
  const activeVariants = variants ?? [];
  const variantsFor = (productId: string) => activeVariants.filter((variant) => variant.product_id === productId);
  const simpleProducts = rows.filter((product) => variantsFor(product.id).length === 0);

  const lowStockProducts = rows.filter((product) => {
    const productVariants = variantsFor(product.id);
    return productVariants.length
      ? productVariants.some((variant) => Number(variant.stock_qty) <= Number(variant.min_stock))
      : Number(product.stock_qty) <= Number(product.min_stock);
  });

  const outOfStockProducts = rows.filter((product) => {
    const productVariants = variantsFor(product.id);
    return productVariants.length
      ? productVariants.some((variant) => Number(variant.stock_qty) <= 0)
      : Number(product.stock_qty) <= 0;
  });

  return <>
    <PageHeader eyebrow="OPERAÇÃO" title="Produtos e estoque" description="Cadastre produtos, preços, estoque mínimo e registre cada entrada ou saída." />

    {lowStockProducts.length > 0 ? (
      <section className={`stock-alert ${outOfStockProducts.length > 0 ? "critical" : ""}`} role="alert">
        <div className="stock-alert-icon">!</div>
        <div className="stock-alert-copy">
          <strong>{outOfStockProducts.length > 0 ? "Atenção: há produto ou variação sem estoque" : "Atenção ao estoque mínimo"}</strong>
          <p>
            {lowStockProducts.length} produto(s) precisam de reposição.
            {outOfStockProducts.length > 0 ? ` ${outOfStockProducts.length} possuem item ou variação zerada.` : " Eles chegaram ao estoque mínimo configurado."}
          </p>
        </div>
        <span className="stock-alert-count">{lowStockProducts.length}</span>
      </section>
    ) : null}

    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Novo produto</h2>{isSchemmer ? <span className="badge success">variações disponíveis</span> : null}</div><div className="panel-body">
        {isSchemmer ? <SchemmerProductForm /> : (
          <form action={createProduct} className="form-grid">
            <label>SKU<input name="sku" required placeholder="Ex.: CEL-001" /></label>
            <label>Código de barras<input name="barcode" placeholder="Opcional" /></label>
            <label className="wide">Nome<input name="name" required /></label>
            <label>Categoria<input name="category" /></label>
            <label>Estoque inicial<input name="stock_qty" type="number" step="0.001" min="0" defaultValue="0" /></label>
            <label>Estoque mínimo<input name="min_stock" type="number" step="0.001" min="0" defaultValue="0" /></label>
            <label>Custo (R$)<input name="cost" type="number" step="0.01" min="0" defaultValue="0" /></label>
            <label>Preço de venda (R$)<input name="price" type="number" step="0.01" min="0" required /></label>
            <label className="wide">Descrição<textarea name="description" /></label>
            <div className="form-actions"><button className="primary">Cadastrar produto</button></div>
          </form>
        )}
      </div></section>

      <section className="panel"><div className="panel-head"><h2>Ajustar estoque simples</h2></div><div className="panel-body">
        <form action={adjustStock} className="form-grid">
          <label className="wide">Produto<select name="product_id" required><option value="">Selecione...</option>{simpleProducts.map((p) => <option key={p.id} value={p.id}>{p.name} — estoque {p.stock_qty}</option>)}</select></label>
          <label>Quantidade (+ entrada / - saída)<input name="quantity_change" type="number" step="0.001" required placeholder="Ex.: 10 ou -2" /></label>
          <label>Motivo<input name="reason" required placeholder="Compra, perda, correção..." /></label>
          <div className="form-actions"><button className="secondary">Registrar ajuste</button></div>
        </form>
        <p className="callout section-gap">Produtos com variações são ajustados individualmente por cor/modelo. As vendas do PDV baixam o estoque automaticamente.</p>
      </div></section>
    </div>

    {isSchemmer && activeVariants.length ? (
      <section className="panel section-gap"><div className="panel-head"><h2>Variações da Schemmer Cell</h2><span className="badge">{activeVariants.length}</span></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Cor</th><th>Modelo</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ajuste</th></tr></thead><tbody>
        {activeVariants.map((variant) => {
          const product = rows.find((row) => row.id === variant.product_id);
          const low = Number(variant.stock_qty) <= Number(variant.min_stock);
          const out = Number(variant.stock_qty) <= 0;
          return <tr key={variant.id} className={low ? (out ? "low-stock-row critical" : "low-stock-row") : ""}>
            <td><strong>{product?.name ?? "Produto"}</strong></td>
            <td>{variant.sku}</td>
            <td>{variant.color ?? "—"}</td>
            <td>{variant.model ?? "—"}</td>
            <td>{brl(variant.price_override ?? product?.price ?? 0)}</td>
            <td>{variant.stock_qty}<small className="stock-minimum">mín. {variant.min_stock}</small></td>
            <td><span className={`badge ${out ? "danger" : low ? "warning" : "success"}`}>{out ? "Sem estoque" : low ? "Estoque mínimo" : "Normal"}</span></td>
            <td><form action={adjustSchemmerVariantStock} className="inline-form"><input type="hidden" name="variant_id" value={variant.id}/><input name="quantity_change" type="number" step="0.001" placeholder="+/-" required/><button className="secondary">Ajustar</button></form></td>
          </tr>;
        })}
      </tbody></table></div></section>
    ) : null}

    <section className="panel section-gap"><div className="panel-head"><h2>Produtos ativos</h2><span className={`badge ${lowStockProducts.length ? "warning" : ""}`}>{rows.length}</span></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.map((p) => {
        const productVariants = variantsFor(p.id);
        const variantStock = productVariants.reduce((total, variant) => total + Number(variant.stock_qty), 0);
        const hasVariants = productVariants.length > 0;
        const low = hasVariants ? productVariants.some((variant) => Number(variant.stock_qty) <= Number(variant.min_stock)) : Number(p.stock_qty) <= Number(p.min_stock);
        const out = hasVariants ? productVariants.some((variant) => Number(variant.stock_qty) <= 0) : Number(p.stock_qty) <= 0;
        const stockLabel = hasVariants ? variantStock : p.stock_qty;
        return <tr key={p.id} className={low ? (out ? "low-stock-row critical" : "low-stock-row") : ""}>
          <td><strong>{p.name}</strong>{hasVariants ? <small className="stock-row-note">{productVariants.length} variação(ões)</small> : low ? <small className="stock-row-note">Reposição necessária</small> : null}</td>
          <td>{p.sku}</td>
          <td>{p.category ?? "—"}</td>
          <td>{brl(p.cost)}</td>
          <td className="amount">{brl(p.price)}</td>
          <td><strong className={low ? "stock-value-alert" : ""}>{stockLabel}</strong><small className="stock-minimum">{hasVariants ? "total das variações" : `mín. ${p.min_stock}`}</small></td>
          <td><span className={`badge ${out ? "danger" : low ? "warning" : "success"}`}>{out ? (hasVariants ? "Variação sem estoque" : "Sem estoque") : low ? "Estoque mínimo" : "Normal"}</span></td>
          <td><div className="toolbar"><a className="secondary" href={`/dashboard/produtos/${p.id}`}>Editar</a><form action={archiveProduct}><input type="hidden" name="id" value={p.id}/><button className="danger">Arquivar</button></form></div></td>
        </tr>;
      })}
      {!rows.length ? <tr><td colSpan={8} className="empty">Nenhum produto cadastrado.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
