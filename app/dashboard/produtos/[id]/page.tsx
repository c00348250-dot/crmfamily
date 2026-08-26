import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { updateProduct } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStoreUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).single();
  if (!product) notFound();
  return <>
    <PageHeader eyebrow="PRODUTOS" title={`Editar ${product.name}`} description="Dados comerciais do produto. O estoque é alterado apenas pelo ajuste de estoque para manter histórico." />
    <section className="panel"><div className="panel-body"><form action={updateProduct} className="form-grid">
      <input type="hidden" name="id" value={product.id}/>
      <label>SKU<input name="sku" required defaultValue={product.sku}/></label><label>Código de barras<input name="barcode" defaultValue={product.barcode ?? ""}/></label>
      <label className="wide">Nome<input name="name" required defaultValue={product.name}/></label><label>Categoria<input name="category" defaultValue={product.category ?? ""}/></label><label>Estoque mínimo<input name="min_stock" type="number" step="0.001" min="0" defaultValue={product.min_stock}/></label>
      <label>Custo (R$)<input name="cost" type="number" step="0.01" min="0" defaultValue={product.cost}/></label><label>Preço (R$)<input name="price" type="number" step="0.01" min="0" defaultValue={product.price}/></label>
      <label className="wide">Descrição<textarea name="description" defaultValue={product.description ?? ""}/></label>
      <div className="form-actions"><a className="secondary" href="/dashboard/produtos">Voltar</a><button className="primary">Salvar alterações</button></div>
    </form></div></section>
  </>;
}
