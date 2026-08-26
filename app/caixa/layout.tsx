import type { CSSProperties } from "react";
import { POSLayout } from "@/components/POS/POSLayout/posLayout";
import { requireCashierUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { createClient } from "@/lib/supabase/server";
import { createPosRepository } from "@/modules/pos/pos.repository";
import { createPosService } from "@/modules/pos/pos.service";

export const dynamic = "force-dynamic";

const brandColors = {
  family: "#13243a",
  sedux: "#c9106a",
  schemmer: "#155fb8",
  housepet: "#b51515",
} as const;

export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireCashierUser();
  const supabase = await createClient();
  const repository = createPosRepository(supabase);
  const service = createPosService(supabase, auth);
  const company = await repository.getCompany(auth.companyId!);
  const brand = getCompanyBrand(company.slug, company.name);
  const session = await service.getSessionSummary();
  const style = { "--brand": brandColors[brand.key] } as CSSProperties;

  return (
    <div className={brand.className} style={style}>
      <POSLayout
        companyName={brand.name}
        businessLabel={brand.businessLabel}
        brandShort={brand.short}
        userName={auth.fullName ?? auth.email ?? "Operador"}
        cashOpen={Boolean(session)}
      >
        {children}
      </POSLayout>
    </div>
  );
}
