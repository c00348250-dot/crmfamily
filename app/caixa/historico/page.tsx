import { History } from "@/components/POS/History/history";
import { requireCashierUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPosService } from "@/modules/pos/pos.service";

export default async function CashierHistoryPage() {
  const auth = await requireCashierUser();
  const supabase = await createClient();
  const service = createPosService(supabase, auth);
  const data = await service.loadHistory();
  return <History sales={data.sales} session={data.session} />;
}
