import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { updateSupplier } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStoreUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data: supplier } = await supabase.from("suppliers").select("*").eq("id", id).single();
  if (!supplier) notFound();
  return <>
    <PageHeader eyebrow="FORNECEDORES" title={`Editar ${supplier.name}`} />
    <section className="panel"><div className="panel-body"><form action={updateSupplier} className="form-grid">
      <input type="hidden" name="id" value={supplier.id}/><label className="wide">Fornecedor<input name="name" required defaultValue={supplier.name}/></label><label>CPF/CNPJ<input name="document" defaultValue={supplier.document ?? ""}/></label><label>Contato<input name="contact_name" defaultValue={supplier.contact_name ?? ""}/></label><label>Telefone<input name="phone" defaultValue={supplier.phone ?? ""}/></label><label>E-mail<input name="email" type="email" defaultValue={supplier.email ?? ""}/></label><label className="wide">Observações<textarea name="notes" defaultValue={supplier.notes ?? ""}/></label><div className="form-actions"><a className="secondary" href="/dashboard/fornecedores">Voltar</a><button className="primary">Salvar alterações</button></div>
    </form></div></section>
  </>;
}
