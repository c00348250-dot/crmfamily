"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string };
type Profile = { id: string; full_name: string; role: string; company_id: string | null; companies?: { name: string } | null };

function roleLabel(role: string) {
  if (role === "store_admin") return "Administrador";
  if (role === "cashier") return "Operador de caixa";
  return "Funcionário";
}

export function AccessManager({ companies, profiles }: { companies: Company[]; profiles: Profile[] }) {
  const router = useRouter();
  const [result, setResult] = useState<{ title: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = new FormData(form);
      const response = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Erro ao criar acesso.");
        return;
      }

      setResult({
        title: `Senha criada para ${body.email} (${body.companyName})`,
        password: body.password,
      });
      form.reset();
      router.refresh();
    } catch {
      setError("Não foi possível concluir a criação do acesso.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(userId: string, name: string) {
    setLoading(true); setError(""); setResult(null);
    const response = await fetch("/api/superadmin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Erro ao redefinir senha."); setLoading(false); return; }
    setResult({ title: `Nova senha de ${name}`, password: body.password }); setLoading(false);
  }

  return <>
    <section className="panel"><div className="panel-head"><h2>Criar acesso de loja</h2></div><div className="panel-body">
      <form className="form-grid" onSubmit={createAccess}>
        <label>Nome da pessoa<input name="fullName" required /></label>
        <label>E-mail de login<input name="email" type="email" required /></label>
        <label>Empresa<select name="companyId" required><option value="">Selecione...</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Nível<select name="role"><option value="store_admin">Administrador da loja</option><option value="store_user">Funcionário do CRM</option><option value="cashier">Operador de caixa — somente PDV</option></select></label>
        <div className="form-actions"><button className="primary" disabled={loading}>{loading ? "Processando..." : "Gerar acesso e senha"}</button></div>
      </form>
      <p className="callout section-gap"><strong>Operador de caixa</strong> entra diretamente na Frente de Caixa e não possui acesso ao dashboard administrativo, financeiro completo, compras ou configurações do CRM.</p>
      {error ? <p className="form-error section-gap">{error}</p> : null}
      {result ? <div className="access-result"><strong>{result.title}</strong><p className="muted">Copie e entregue a senha. Ela não é armazenada em texto aberto pelo CRM.</p><div className="password-box">{result.password}</div></div> : null}
    </div></section>

    <section className="panel section-gap"><div className="panel-head"><h2>Acessos existentes</h2><span className="badge">{profiles.length}</span></div><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Empresa</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>
      {profiles.map((p) => <tr key={p.id}><td><strong>{p.full_name}</strong></td><td>{p.companies?.name ?? "—"}</td><td>{roleLabel(p.role)}</td><td><button type="button" className="secondary" onClick={() => resetPassword(p.id, p.full_name)} disabled={loading}>Gerar nova senha</button></td></tr>)}
      {!profiles.length ? <tr><td colSpan={4} className="empty">Nenhum acesso de loja criado.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
