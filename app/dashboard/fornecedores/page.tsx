import { PageHeader } from "@/components/page-header";
import { archiveSupplier, createSupplier } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SuppliersPage() {
  await requireStoreUser();
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("*").eq("is_active", true).order("name");
  return <>
    <PageHeader eyebrow="COMPRAS" title="Fornecedores" description="Centralize contatos e dados dos fornecedores da loja." />
    <section className="panel"><div className="panel-head"><h2>Novo fornecedor</h2></div><div className="panel-body"><form action={createSupplier} className="form-grid">
      <label className="wide">Empresa / fornecedor<input name="name" required /></label><label>CPF/CNPJ<input name="document" /></label><label>Contato<input name="contact_name" /></label><label>Telefone<input name="phone" /></label><label>E-mail<input name="email" type="email" /></label><label className="wide">Observações<textarea name="notes" /></label><div className="form-actions"><button className="primary">Cadastrar fornecedor</button></div>
    </form></div></section>
    <section className="panel section-gap"><div className="panel-head"><h2>Fornecedores ativos</h2><span className="badge">{suppliers?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>Fornecedor</th><th>Documento</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>
      {suppliers?.map((s) => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.document ?? "—"}</td><td>{s.contact_name ?? "—"}</td><td>{s.phone ?? "—"}</td><td>{s.email ?? "—"}</td><td><div className="toolbar"><a className="secondary" href={`/dashboard/fornecedores/${s.id}`}>Editar</a><form action={archiveSupplier}><input type="hidden" name="id" value={s.id}/><button className="danger">Arquivar</button></form></div></td></tr>)}
      {!suppliers?.length ? <tr><td colSpan={6} className="empty">Nenhum fornecedor cadastrado.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
