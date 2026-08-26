import { Receipt } from "@/components/POS/Receipt/receipt";
import { requireCashierUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPosService } from "@/modules/pos/pos.service";

export const dynamic = "force-dynamic";

export default async function CashierReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCashierUser();
  const { id } = await params;
  const supabase = await createClient();
  const service = createPosService(supabase, auth);
  const receipt = await service.loadReceipt(id);
  return <Receipt receipt={receipt} />;
}
