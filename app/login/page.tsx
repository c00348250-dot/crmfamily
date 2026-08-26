import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-hero">
        <span className="eyebrow">GESTÃO MULTILOJAS</span>
        <h2>Três empresas.<br />Uma visão organizada.</h2>
        <p>Estoque, clientes, vendas, financeiro, fornecedores, compras e módulos específicos para cada negócio, com os dados totalmente separados.</p>
        <div className="company-pills">
          <span>Sedux</span><span>Schemmer Cell</span><span>House Pet</span>
        </div>
      </section>
      <LoginForm />
    </main>
  );
}
