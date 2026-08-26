"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PwaInstallButton } from "@/components/pwa-install-button";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error || !result.data.user) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    const role = String(result.data.user.app_metadata?.role ?? "");
    router.replace(role === "cashier" ? "/caixa" : "/dashboard");
    router.refresh();
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="brand-mark">CF</div>
      <div>
        <span className="eyebrow">ACESSO SEGURO</span>
        <h1>CRM Family</h1>
        <p className="muted">Entre com o acesso da sua empresa.</p>
      </div>
      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label>
        Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary" type="submit" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </button>
      <PwaInstallButton mode="login" />
      <p className="login-footnote">O sistema identifica automaticamente qual empresa e qual ambiente este login pode acessar.</p>
    </form>
  );
}
