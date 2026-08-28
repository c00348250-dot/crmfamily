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

function numberValue(formData: FormData, key: string) {
  const raw = text(formData, key).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error("Peso inválido.");
  return value;
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function revalidatePetViews() {
  revalidatePath("/dashboard/pets");
  revalidatePath("/dashboard/alertas");
  revalidatePath("/caixa");
  revalidatePath("/caixa/agenda");
}

export async function updatePet(formData: FormData) {
  const auth = await requireStoreUser();
  const companyId = auth.companyId;
  if (!companyId) throw new Error("Empresa não identificada.");

  const id = text(formData, "id");
  const customerId = text(formData, "customer_id");
  const name = text(formData, "name");
  const species = text(formData, "species");

  if (!id) throw new Error("Pet não identificado.");
  if (!customerId) throw new Error("Selecione o tutor do pet.");
  if (!name) throw new Error("Informe o nome do pet.");
  if (!species) throw new Error("Informe a espécie do pet.");

  const supabase = await createClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new Error("Tutor não encontrado nesta empresa.");

  const payload = {
    customer_id: customerId,
    name,
    species,
    breed: optional(formData, "breed"),
    sex: optional(formData, "sex"),
    birth_date: optional(formData, "birth_date"),
    weight: numberValue(formData, "weight"),
    neutered: boolValue(formData, "neutered"),
    allergies: optional(formData, "allergies"),
    behavior_notes: optional(formData, "behavior_notes"),
    medications: optional(formData, "medications"),
    photo_url: optional(formData, "photo_url"),
    notes: optional(formData, "notes"),
  };

  const { data: pet, error } = await supabase
    .from("pets")
    .update(payload)
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pet) throw new Error("Pet não encontrado ou já arquivado.");

  await supabase.from("audit_logs").insert({
    company_id: companyId,
    user_id: auth.id,
    action: "update",
    entity_type: "pet",
    entity_id: id,
    details: { name, customer_id: customerId },
  });

  revalidatePetViews();
}

export async function archivePet(formData: FormData) {
  const auth = await requireStoreUser();
  const companyId = auth.companyId;
  if (!companyId) throw new Error("Empresa não identificada.");

  const id = text(formData, "id");
  if (!id) throw new Error("Pet não identificado.");

  const supabase = await createClient();
  const { data: pet, error } = await supabase
    .from("pets")
    .update({ is_active: false })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .select("id,name")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pet) throw new Error("Pet não encontrado ou já arquivado.");

  await supabase.from("audit_logs").insert({
    company_id: companyId,
    user_id: auth.id,
    action: "archive",
    entity_type: "pet",
    entity_id: id,
    details: { name: pet.name },
  });

  revalidatePetViews();
}
