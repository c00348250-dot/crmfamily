import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type PurchaseInputItem = {
  product_id: string;
  quantity: number;
  unit_cost: number;
};

function saoPauloDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function POST(request: Request) {
  try {
    const auth = await requireStoreUser();
    const body = await request.json();
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return NextResponse.json({ error: "Adicione ao menos um item à compra." }, { status: 400 });

    const normalized: PurchaseInputItem[] = rawItems.map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        product_id: String(record.product_id ?? ""),
        quantity: Number(record.quantity ?? 0),
        unit_cost: Number(record.unit_cost ?? 0),
      };
    });

    if (normalized.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0)) {
      return NextResponse.json({ error: "Existem itens inválidos na compra." }, { status: 400 });
    }

    const supabase = await createClient();
    const productIds = [...new Set(normalized.map((item) => item.product_id))];
    const { data: products, error: productsError } = await supabase.from("products").select("id").in("id", productIds).eq("is_active", true);
    if (productsError || (products?.length ?? 0) !== productIds.length) {
      return NextResponse.json({ error: "Um ou mais produtos são inválidos para esta empresa." }, { status: 400 });
    }

    const supplierId = body.supplierId ? String(body.supplierId) : null;
    if (supplierId) {
      const supplier = await supabase.from("suppliers").select("id").eq("id", supplierId).eq("is_active", true).single();
      if (supplier.error || !supplier.data) return NextResponse.json({ error: "Fornecedor inválido." }, { status: 400 });
    }

    const total = normalized.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
    const { data: purchase, error } = await supabase.from("purchases").insert({
      company_id: auth.companyId,
      supplier_id: supplierId,
      invoice_number: body.invoiceNumber ? String(body.invoiceNumber).trim() : null,
      status: "ordered",
      total,
      payment_status: body.paymentStatus === "paid" ? "paid" : "pending",
      ordered_at: body.orderedAt ? String(body.orderedAt) : saoPauloDateKey(),
      notes: body.notes ? String(body.notes).trim() : null,
      created_by: auth.id,
    }).select("id,purchase_number").single();
    if (error || !purchase) return NextResponse.json({ error: error?.message ?? "Não foi possível criar a compra." }, { status: 400 });

    const { error: itemsError } = await supabase.from("purchase_items").insert(normalized.map((item) => ({
      company_id: auth.companyId,
      purchase_id: purchase.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    })));

    if (itemsError) {
      await supabase.from("purchases").delete().eq("id", purchase.id);
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    await supabase.from("audit_logs").insert({
      company_id: auth.companyId,
      user_id: auth.id,
      action: "create",
      entity_type: "purchase",
      entity_id: purchase.id,
      details: { items: normalized.length, total },
    });

    return NextResponse.json({ purchaseId: purchase.id, purchaseNumber: purchase.purchase_number });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado." }, { status: 400 });
  }
}
