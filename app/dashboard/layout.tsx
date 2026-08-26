import { redirect } from "next/navigation";
import { DashboardLiveRefresh } from "@/components/DashboardLiveRefresh/dashboardLiveRefresh";
import { ResponsiveEnhancer } from "@/components/responsive-enhancer";
import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  if (auth.role === "cashier") redirect("/caixa");

  let companyName = "Todas as empresas";
  let companySlug: string | null = null;

  if (auth.companyId) {
    const supabase = await createClient();
    const { data } = await supabase.from("companies").select("name,slug").eq("id", auth.companyId).single();
    companyName = data?.name ?? "Minha empresa";
    companySlug = data?.slug ?? null;
  }

  const brand = getCompanyBrand(companySlug, companyName);

  return (
    <div className={`app-shell ${auth.role === "super_admin" ? "theme-family" : brand.className}`}>
      <Sidebar role={auth.role} companyName={companyName} companySlug={companySlug} userName={auth.fullName ?? auth.email ?? "Usuário"} />
      <main className="content">{children}</main>
      <DashboardLiveRefresh />
      <ResponsiveEnhancer />
    </div>
  );
}
