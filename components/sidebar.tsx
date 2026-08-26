"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCompanyBrand } from "@/lib/company-brand";
import { PwaInstallButton } from "@/components/pwa-install-button";
import type { UserRole } from "@/lib/types";

type NavItem = readonly [href: string, label: string, icon: string];

const baseStoreItems: readonly NavItem[] = [
  ["/dashboard", "Visão geral", "⌂"],
  ["/dashboard/produtos", "Produtos e estoque", "□"],
  ["/dashboard/clientes", "Clientes", "♙"],
  ["/dashboard/vendas", "Vendas", "▣"],
  ["/dashboard/desempenho", "Desempenho", "↗"],
  ["/dashboard/compras", "Compras", "⇩"],
  ["/dashboard/financeiro", "Financeiro", "$"],
  ["/dashboard/fornecedores", "Fornecedores", "◇"],
  ["/dashboard/devedores", "Clientes devedores", "!"],
  ["/dashboard/alertas", "Central de alertas", "●"],
];

const superItems: readonly NavItem[] = [
  ["/dashboard", "Visão geral", "⌂"],
  ["/dashboard/relatorios", "Relatórios", "▤"],
  ["/dashboard/acessos", "Acessos das lojas", "⚿"],
];

type Props = {
  role: UserRole;
  companyName: string;
  companySlug?: string | null;
  userName: string;
};

export function Sidebar({ role, companyName, companySlug, userName }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const brand = getCompanyBrand(companySlug, companyName);
  const displayName = role === "super_admin" ? "CRM Family" : brand.name;
  const displayLabel = role === "super_admin" ? "SuperAdmin" : brand.businessLabel;
  const displayShort = role === "super_admin" ? "CF" : brand.short;

  const items = useMemo<readonly NavItem[]>(() => {
    if (role === "super_admin") return superItems;

    const specialized: readonly NavItem[] = brand.key === "schemmer"
      ? [["/dashboard/assistencia", "Assistência técnica", "⚙"]]
      : brand.key === "housepet"
        ? [["/dashboard/pets", "Pets e agenda", "♥"]]
        : brand.key === "sedux"
          ? [["/dashboard/catalogo", "Variações, kits e validade", "◆"]]
          : [];

    return [baseStoreItems[0], ...specialized, ...baseStoreItems.slice(1)];
  }, [role, brand.key]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Erro ao sair:", error.message);
      setLoggingOut(false);
      return;
    }

    setMobileOpen(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="mobile-appbar">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Abrir menu"
          aria-expanded={mobileOpen}
          aria-controls="crm-sidebar"
          onClick={() => setMobileOpen(true)}
        >
          <span aria-hidden="true" />
        </button>
        <span className="mobile-brand-mark" aria-hidden="true">{displayShort}</span>
        <div className="mobile-brand-copy">
          <strong>{displayName}</strong>
          <small>{displayLabel}</small>
        </div>
      </header>

      <button
        type="button"
        className={`mobile-menu-backdrop ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Fechar menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <aside id="crm-sidebar" className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-label="Navegação principal">
        <div className="side-brand">
          <span>{displayShort}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{displayLabel}</small>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            title="Sair da conta"
            aria-label="Sair da conta"
            className="logout-button"
          >
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
          <button type="button" className="mobile-drawer-close" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}>×</button>
        </div>
        <nav>
          {items.map(([href, label, icon]) => {
            const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}><b>{icon}</b>{label}</Link>;
          })}
        </nav>
        <div className="pwa-install-slot">
          <PwaInstallButton />
        </div>
        <div className="side-user">
          <small>Conectado como</small>
          <strong>{userName}</strong>
          <button type="button" className="mobile-logout-button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Saindo..." : "Sair da conta"}</button>
        </div>
      </aside>
    </>
  );
}
