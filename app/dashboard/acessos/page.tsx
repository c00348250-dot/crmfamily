import { AccessManager } from "@/components/access-manager";
import { PageHeader } from "@/components/page-header";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AccessPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: companies }, { data: profiles }] = await Promise.all([
    supabase.from("companies").select("id,name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id,full_name,role,company_id,companies(name)").in("role", ["store_admin","store_user","cashier"]).order("full_name"),
  ]);
  return <>
    <PageHeader eyebrow="SUPERADMIN" title="Acessos das lojas" description="Crie logins administrativos, operacionais e de caixa sem misturar permissões entre os ambientes." />
    <p className="callout">As senhas são geradas de forma aleatória. O sistema mostra a nova senha para você entregar à pessoa, mas não salva uma cópia legível dela.</p>
    <div className="section-gap"><AccessManager companies={(companies ?? []) as never[]} profiles={(profiles ?? []) as never[]} /></div>
  </>;
}
