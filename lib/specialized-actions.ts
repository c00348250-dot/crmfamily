"use server";

import { revalidatePath } from "next/cache";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}
function numberValue(formData: FormData, key: string, fallback = 0) {
  const parsed = Number(text(formData, key).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}
async function audit(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, userId: string, action: string, entityType: string, entityId?: string | null, details?: Record<string, unknown>) {
  await supabase.from("audit_logs").insert({ company_id: companyId, user_id: userId, action, entity_type: entityType, entity_id: entityId ?? null, details: details ?? null });
}

export async function createServiceOrder(formData: FormData) {
  const auth = await requireStoreUser();
  if (!auth.companyId) throw new Error("Empresa não identificada.");

  const deviceBrand = text(formData, "device_brand");
  const deviceModel = text(formData, "device_model");
  const issueReported = text(formData, "issue_reported");

  if (!deviceBrand) throw new Error("Informe a marca do aparelho.");
  if (!deviceModel) throw new Error("Informe o modelo do aparelho.");
  if (!issueReported) throw new Error("Informe o defeito do aparelho.");

  const supabase = await createClient();
  const payload = {
    company_id: auth.companyId,
    customer_id: optional(formData, "customer_id"),
    device_brand: deviceBrand,
    device_model: deviceModel,
    imei: optional(formData, "imei"),
    serial_number: optional(formData, "serial_number"),
    color: optional(formData, "color"),
    issue_reported: issueReported,
    condition_notes: optional(formData, "condition_notes"),
    accessories: optional(formData, "accessories"),
    technician: optional(formData, "technician"),
    quote_amount: Math.max(0, numberValue(formData, "quote_amount")),
    parts_cost: Math.max(0, numberValue(formData, "parts_cost")),
    labor_amount: Math.max(0, numberValue(formData, "labor_amount")),
    warranty_days: Math.max(0, Math.round(numberValue(formData, "warranty_days", 90))),
    estimated_delivery: optional(formData, "estimated_delivery"),
    notes: optional(formData, "notes"),
    created_by: auth.id,
  };
  const { data, error } = await supabase.from("service_orders").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId, auth.id, "create", "service_order", data.id, { model: `${payload.device_brand} ${payload.device_model}` });
  revalidatePath("/dashboard/assistencia");
  revalidatePath("/dashboard/alertas");
}

export async function updateServiceOrderStatus(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const status = text(formData, "status");
  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  const { error } = await supabase.from("service_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "status", "service_order", id, { status });
  revalidatePath("/dashboard/assistencia");
  revalidatePath("/dashboard/alertas");
}

export async function createDeviceUnit(formData: FormData) {
  const auth = await requireStoreUser();
  if (!auth.companyId) throw new Error("Empresa não identificada.");

  const brand = text(formData, "brand");
  const model = text(formData, "model");
  if (!brand) throw new Error("Informe a marca do aparelho.");
  if (!model) throw new Error("Informe o modelo do aparelho.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("device_units").insert({
    company_id: auth.companyId,
    product_id: optional(formData, "product_id"),
    brand,
    model,
    imei: optional(formData, "imei"),
    serial_number: optional(formData, "serial_number"),
    color: optional(formData, "color"),
    purchase_cost: Math.max(0, numberValue(formData, "purchase_cost")),
    sale_price: Math.max(0, numberValue(formData, "sale_price")),
    warranty_days: Math.max(0, Math.round(numberValue(formData, "warranty_days", 90))),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId, auth.id, "create", "device_unit", data.id, { imei: optional(formData, "imei"), model });
  revalidatePath("/dashboard/assistencia");
}

export async function createPet(formData: FormData) {
  const auth = await requireStoreUser();
  if (!auth.companyId) throw new Error("Empresa não identificada.");

  const customerId = text(formData, "customer_id");
  const name = text(formData, "name");
  const species = text(formData, "species");

  if (!customerId) throw new Error("Selecione o tutor do pet.");
  if (!name) throw new Error("Informe o nome do pet.");
  if (!species) throw new Error("Informe a espécie do pet.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").insert({
    company_id: auth.companyId,
    customer_id: customerId,
    name,
    species,
    breed: optional(formData, "breed"),
    sex: optional(formData, "sex"),
    birth_date: optional(formData, "birth_date"),
    weight: optional(formData, "weight") ? Math.max(0, numberValue(formData, "weight")) : null,
    neutered: boolValue(formData, "neutered"),
    allergies: optional(formData, "allergies"),
    behavior_notes: optional(formData, "behavior_notes"),
    medications: optional(formData, "medications"),
    photo_url: optional(formData, "photo_url"),
    notes: optional(formData, "notes"),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId, auth.id, "create", "pet", data.id, { name });
  revalidatePath("/dashboard/pets");
}

export async function createPetAppointment(formData: FormData) {
  const auth = await requireStoreUser();
  if (!auth.companyId) throw new Error("Empresa não identificada.");

  const petId = text(formData, "pet_id");
  const serviceType = text(formData, "service_type");
  const scheduled = text(formData, "scheduled_at");

  if (!petId) throw new Error("Selecione o pet do agendamento.");
  if (!serviceType) throw new Error("Informe o tipo de serviço.");
  if (!scheduled) throw new Error("Informe a data e hora do agendamento.");

  const supabase = await createClient();
  const { data: pet, error: petError } = await supabase.from("pets").select("customer_id").eq("id", petId).eq("company_id", auth.companyId).single();
  if (petError || !pet?.customer_id) throw new Error("Pet ou tutor não encontrado nesta empresa.");
  const scheduledAt = new Date(`${scheduled}:00-03:00`).toISOString();
  const { data, error } = await supabase.from("pet_appointments").insert({
    company_id: auth.companyId,
    pet_id: petId,
    customer_id: pet.customer_id,
    service_type: serviceType,
    scheduled_at: scheduledAt,
    price: Math.max(0, numberValue(formData, "price")),
    responsible: optional(formData, "responsible"),
    service_notes: optional(formData, "service_notes"),
    created_by: auth.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId, auth.id, "create", "pet_appointment", data.id, { service: serviceType });
  revalidatePath("/dashboard/pets");
  revalidatePath("/dashboard/alertas");
}

export async function updatePetAppointment(formData: FormData) {
  const auth = await requireStoreUser();
  const companyId = auth.companyId;
  if (!companyId) throw new Error("Empresa não identificada.");

  const supabase = await createClient();
  const id = text(formData, "id");
  if (!id) throw new Error("Agendamento não identificado.");

  const { data: appointment, error: appointmentError } = await supabase
    .from("pet_appointments")
    .select("id,status,company_id,pet_id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (appointmentError) throw new Error(appointmentError.message);
  if (!appointment) throw new Error("Agendamento não encontrado.");
  if (["delivered", "cancelled"].includes(appointment.status)) throw new Error("Agendamento finalizado não pode ser editado.");

  const petId = text(formData, "pet_id");
  if (!petId) throw new Error("Selecione o pet do agendamento.");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id,customer_id,is_active")
    .eq("id", petId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (petError) throw new Error(petError.message);
  if (!pet?.customer_id) throw new Error("Pet não encontrado nesta empresa.");
  if (!pet.is_active && pet.id !== appointment.pet_id) throw new Error("Selecione um pet ativo para o agendamento.");

  const serviceType = text(formData, "service_type");
  if (!serviceType) throw new Error("Informe o tipo de serviço.");

  const scheduled = text(formData, "scheduled_at");
  if (!scheduled) throw new Error("Informe a data e hora do agendamento.");
  const scheduledAt = new Date(`${scheduled}:00-03:00`).toISOString();

  const price = numberValue(formData, "price");
  if (price < 0) throw new Error("Valor do atendimento não pode ser negativo.");

  const payload = {
    pet_id: petId,
    customer_id: pet.customer_id,
    service_type: serviceType,
    scheduled_at: scheduledAt,
    price,
    responsible: optional(formData, "responsible"),
    service_notes: optional(formData, "service_notes"),
  };

  const { error } = await supabase
    .from("pet_appointments")
    .update(payload)
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  await audit(supabase, companyId, auth.id, "update", "pet_appointment", id, {
    pet_id: petId,
    service_type: serviceType,
    scheduled_at: scheduledAt,
    price,
    responsible: payload.responsible,
  });

  revalidatePath("/dashboard/pets");
  revalidatePath("/dashboard/alertas");
}

export async function updatePetAppointmentStatus(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const status = text(formData, "status");
  const { error } = await supabase.from("pet_appointments").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "status", "pet_appointment", id, { status });
  revalidatePath("/dashboard/pets");
  revalidatePath("/dashboard/alertas");
}

export async function createProductVariant(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_variants").insert({
    company_id: auth.companyId,
    product_id: text(formData, "product_id"),
    sku: text(formData, "sku"),
    color: optional(formData, "color"),
    size: optional(formData, "size"),
    model: optional(formData, "model"),
    flavor: optional(formData, "flavor"),
    volume: optional(formData, "volume"),
    stock_qty: Math.max(0, numberValue(formData, "stock_qty")),
    min_stock: Math.max(0, numberValue(formData, "min_stock")),
    price_override: optional(formData, "price_override") ? Math.max(0, numberValue(formData, "price_override")) : null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "create", "product_variant", data.id, { sku: text(formData, "sku") });
  revalidatePath("/dashboard/catalogo");
  revalidatePath("/dashboard/alertas");
}

export async function adjustVariantStock(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "variant_id");
  const change = numberValue(formData, "quantity_change");
  const { data } = await supabase.from("product_variants").select("stock_qty").eq("id", id).single();
  const next = Number(data?.stock_qty ?? 0) + change;
  if (next < 0) throw new Error("Estoque da variação não pode ficar negativo.");
  const { error } = await supabase.from("product_variants").update({ stock_qty: next }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "stock", "product_variant", id, { change, stock: next });
  revalidatePath("/dashboard/catalogo");
  revalidatePath("/dashboard/alertas");
}

export async function createProductBatch(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_batches").insert({
    company_id: auth.companyId,
    product_id: text(formData, "product_id"),
    lot_number: optional(formData, "lot_number"),
    expires_at: text(formData, "expires_at"),
    quantity: Math.max(0, numberValue(formData, "quantity")),
    notes: optional(formData, "notes"),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "create", "product_batch", data.id, { expires_at: text(formData, "expires_at") });
  revalidatePath("/dashboard/catalogo");
  revalidatePath("/dashboard/alertas");
}

export async function createBundle(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("bundles").insert({
    company_id: auth.companyId,
    name: text(formData, "name"),
    sku: text(formData, "sku"),
    price: Math.max(0, numberValue(formData, "price")),
    description: optional(formData, "description"),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "create", "bundle", data.id, { name: text(formData, "name") });
  revalidatePath("/dashboard/catalogo");
}

export async function addBundleItem(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const bundleId = text(formData, "bundle_id");
  const { error } = await supabase.from("bundle_items").upsert({
    company_id: auth.companyId,
    bundle_id: bundleId,
    product_id: text(formData, "product_id"),
    quantity: Math.max(0.001, numberValue(formData, "quantity", 1)),
  }, { onConflict: "bundle_id,product_id" });
  if (error) throw new Error(error.message);
  await audit(supabase, auth.companyId!, auth.id, "component", "bundle", bundleId, { product_id: text(formData, "product_id") });
  revalidatePath("/dashboard/catalogo");
}

export async function sellBundle(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const result = await supabase.rpc("create_bundle_sale", {
    p_bundle_id: text(formData, "bundle_id"),
    p_customer_id: optional(formData, "customer_id"),
    p_payment_method: text(formData, "payment_method") || "Pix",
  });
  if (result.error) throw new Error(result.error.message);
  await audit(supabase, auth.companyId!, auth.id, "sale", "bundle", text(formData, "bundle_id"), { sale_id: result.data });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/catalogo");
  revalidatePath("/dashboard/produtos");
  revalidatePath("/dashboard/vendas");
}

export async function createPurchase(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data: purchase, error } = await supabase.from("purchases").insert({
    company_id: auth.companyId,
    supplier_id: optional(formData, "supplier_id"),
    invoice_number: optional(formData, "invoice_number"),
    status: "ordered",
    payment_status: text(formData, "payment_status") === "paid" ? "paid" : "pending",
    ordered_at: optional(formData, "ordered_at") ?? new Date().toISOString().slice(0, 10),
    notes: optional(formData, "notes"),
    created_by: auth.id,
  }).select("id").single();
  if (error) throw new Error(error.message);

  const quantity = Math.max(0.001, numberValue(formData, "quantity", 1));
  const unitCost = Math.max(0, numberValue(formData, "unit_cost"));
  const itemResult = await supabase.from("purchase_items").insert({
    company_id: auth.companyId,
    purchase_id: purchase.id,
    product_id: text(formData, "product_id"),
    quantity,
    unit_cost: unitCost,
  });
  if (itemResult.error) throw new Error(itemResult.error.message);
  await supabase.from("purchases").update({ total: quantity * unitCost }).eq("id", purchase.id);
  await audit(supabase, auth.companyId!, auth.id, "create", "purchase", purchase.id, { quantity, unitCost });
  revalidatePath("/dashboard/compras");
}

export async function receivePurchase(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const result = await supabase.rpc("receive_purchase", { p_purchase_id: id });
  if (result.error) throw new Error(result.error.message);
  await audit(supabase, auth.companyId!, auth.id, "receive", "purchase", id);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/compras");
  revalidatePath("/dashboard/produtos");
  revalidatePath("/dashboard/financeiro");
  revalidatePath("/dashboard/alertas");
}
