import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    await requireStoreUser();
    const payload = await request.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_sale", {
      p_customer_id: payload.customerId || null,
      p_discount: Number(payload.discount || 0),
      p_payment_method: String(payload.paymentMethod || "Não informado"),
      p_payment_status: String(payload.paymentStatus || "paid"),
      p_amount_paid: Number(payload.amountPaid || 0),
      p_due_date: payload.dueDate || null,
      p_items: items.map((item: { product_id?: string; quantity?: number }) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity || 0),
      })),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ saleId: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado" }, { status: 401 });
  }
}
