import { NextResponse } from "next/server";
import { requireCashierUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPosService } from "@/modules/pos/pos.service";
import { parseSalePayload } from "@/modules/pos/pos.validation";

export async function POST(request: Request) {
  try {
    const auth = await requireCashierUser();
    const input = parseSalePayload(await request.json());
    const supabase = await createClient();
    const service = createPosService(supabase, auth);
    const sale = await service.createSale(input);
    return NextResponse.json({ sale });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 400 });
  }
}
