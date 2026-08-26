import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { updateCustomer } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStoreUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).single();
  if (!customer) notFound();
  return <>
    <PageHeader eyebrow="CLIENTES" title={`Editar ${customer.name}`} />
    <section className="panel"><div className="panel-body"><form action={updateCustomer} className="form-grid">
      <input type="hidden" name="id" value={customer.id}/><label className="wide">Nome<input name="name" required defaultValue={customer.name}/></label><label>CPF/CNPJ<input name="document" defaultValue={customer.document ?? ""}/></label><label>Telefone<input name="phone" defaultValue={customer.phone ?? ""}/></label><label>E-mail<input name="email" type="email" defaultValue={customer.email ?? ""}/></label><label>Endereço<input name="address" defaultValue={customer.address ?? ""}/></label><label className="wide">Observações<textarea name="notes" defaultValue={customer.notes ?? ""}/></label><div className="form-actions"><a className="secondary" href="/dashboard/clientes">Voltar</a><button className="primary">Salvar alterações</button></div>
    </form></div></section>
  </>;
}
