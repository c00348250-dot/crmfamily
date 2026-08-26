import { NextResponse } from "next/server";
import { requireCashierUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPosService } from "@/modules/pos/pos.service";
import { parseCancelSalePayload } from "@/modules/pos/pos.validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireCashierUser();
    const { id } = await params;
    const input = parseCancelSalePayload(await request.json());
    const supabase = await createClient();
    const service = createPosService(supabase, auth);
    await service.cancelSale(id, input.reason, input.refundSessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 400 });
  }
}
