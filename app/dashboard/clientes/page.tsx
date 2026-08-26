import { PageHeader } from "@/components/page-header";
import { archiveCustomer, createCustomer } from "@/lib/actions";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CustomersPage() {
  await requireStoreUser();
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("*").eq("is_active", true).order("name");
  return <>
    <PageHeader eyebrow="RELACIONAMENTO" title="Clientes" description="Cadastro simples para vendas, histórico e controle de valores a receber." />
    <section className="panel"><div className="panel-head"><h2>Novo cliente</h2></div><div className="panel-body"><form action={createCustomer} className="form-grid">
      <label className="wide">Nome<input name="name" required /></label><label>CPF/CNPJ<input name="document" /></label><label>Telefone<input name="phone" /></label><label>E-mail<input name="email" type="email" /></label><label>Endereço<input name="address" /></label><label className="wide">Observações<textarea name="notes" /></label><div className="form-actions"><button className="primary">Cadastrar cliente</button></div>
    </form></div></section>
    <section className="panel section-gap"><div className="panel-head"><h2>Clientes ativos</h2><span className="badge">{customers?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Documento</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>
      {customers?.map((c) => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.document ?? "—"}</td><td>{c.phone ?? "—"}</td><td>{c.email ?? "—"}</td><td><div className="toolbar"><a className="secondary" href={`/dashboard/clientes/${c.id}`}>Editar</a><form action={archiveCustomer}><input type="hidden" name="id" value={c.id}/><button className="danger">Arquivar</button></form></div></td></tr>)}
      {!customers?.length ? <tr><td colSpan={5} className="empty">Nenhum cliente cadastrado.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
