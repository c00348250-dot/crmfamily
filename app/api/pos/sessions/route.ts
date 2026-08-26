import { NextResponse } from "next/server";
import { requireCashierUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPosService } from "@/modules/pos/pos.service";
import { parseSessionPayload } from "@/modules/pos/pos.validation";

export async function POST(request: Request) {
  try {
    const auth = await requireCashierUser();
    const input = parseSessionPayload(await request.json());
    const supabase = await createClient();
    const service = createPosService(supabase, auth);

    if (input.action === "open") {
      const sessionId = await service.openSession(input.openingAmount, input.notes);
      return NextResponse.json({ sessionId });
    }

    const summary = await service.closeSession(input.sessionId, input.closingAmount, input.notes);
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 400 });
  }
}
