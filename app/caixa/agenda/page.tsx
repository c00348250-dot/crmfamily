import { Agenda } from "@/components/POS/Agenda/agenda";
import { requireCashierUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPosService } from "@/modules/pos/pos.service";

export default async function CashierAgendaPage() {
  const auth = await requireCashierUser();
  const supabase = await createClient();
  const service = createPosService(supabase, auth);
  const data = await service.loadAgenda();
  return <Agenda brandKey={data.brandKey} brandName={data.brandName} items={data.items} />;
}
