"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./posLayout.module.css";

type Props = {
  companyName: string;
  businessLabel: string;
  brandShort: string;
  userName: string;
  cashOpen: boolean;
  children: React.ReactNode;
};

const items = [
  ["/caixa", "Frente de caixa", "PDV"],
  ["/caixa/agenda", "Agenda", "Hoje"],
  ["/caixa/historico", "Histórico", "Vendas"],
] as const;

export function POSLayout({ companyName, businessLabel, brandShort, userName, cashOpen, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}>{brandShort}</span>
          <div>
            <span className={styles.kicker}>FRENTE DE CAIXA</span>
            <strong>{companyName}</strong>
            <small>{businessLabel}</small>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Navegação do caixa">
          {items.map(([href, label, detail]) => {
            const active = href === "/caixa" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? styles.active : ""}>
                <span>{label}</span>
                <small>{detail}</small>
              </Link>
            );
          })}
        </nav>

        <div className={styles.operator}>
          <span className={`${styles.cashStatus} ${cashOpen ? styles.open : styles.closed}`}>
            <i /> {cashOpen ? "Caixa aberto" : "Caixa fechado"}
          </span>
          <div>
            <small>Operador</small>
            <strong>{userName}</strong>
          </div>
          <button type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Saindo..." : "Sair"}</button>
        </div>
      </header>

      <main className={styles.content}>{children}</main>

      <nav className={styles.mobileNav} aria-label="Navegação móvel do caixa">
        {items.map(([href, label]) => {
          const active = href === "/caixa" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={active ? styles.active : ""}>{label}</Link>;
        })}
      </nav>
    </div>
  );
}
