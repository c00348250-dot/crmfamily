"use server";

import { revalidatePath } from "next/cache";
import { requireStoreUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function number(formData: FormData, key: string, fallback = 0) {
  const parsed = Number(text(formData, key).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createProduct(formData: FormData) {
  const auth = await requireStoreUser();
  if (!auth.companyId) throw new Error("Empresa não identificada.");

  const sku = text(formData, "sku");
  const name = text(formData, "name");
  const price = number(formData, "price");

  if (!sku) throw new Error("Informe o SKU do produto.");
  if (!name) throw new Error("Informe o nome do produto.");
  if (price < 0) throw new Error("Preço de venda inválido.");

  const supabase = await createClient();
  const initialStock = Math.max(0, number(formData, "stock_qty"));

  const { data, error } = await supabase
    .from("products")
    .insert({
      company_id: auth.companyId,
      sku,
      barcode: optional(formData, "barcode"),
      name,
      description: optional(formData, "description"),
      category: optional(formData, "category"),
      cost: Math.max(0, number(formData, "cost")),
      price: Math.max(0, price),
      stock_qty: 0,
      min_stock: Math.max(0, number(formData, "min_stock")),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message.includes("duplicate") ? "Já existe um produto com este SKU nesta empresa." : error.message);

  if (initialStock > 0 && data?.id) {
    const stockResult = await supabase.rpc("adjust_stock", {
      p_product_id: data.id,
      p_quantity_change: initialStock,
      p_reason: "Estoque inicial",
    });
    if (stockResult.error) throw new Error(stockResult.error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/produtos");
}

export async function adjustStock(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const result = await supabase.rpc("adjust_stock", {
    p_product_id: text(formData, "product_id"),
    p_quantity_change: number(formData, "quantity_change"),
    p_reason: text(formData, "reason") || "Ajuste manual",
  });
  if (result.error) throw new Error(result.error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/produtos");
}

export async function archiveProduct(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ is_active: false }).eq("id", text(formData, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/produtos");
}

export async function createCustomer(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    company_id: auth.companyId,
    name: text(formData, "name"),
    document: optional(formData, "document"),
    phone: optional(formData, "phone"),
    email: optional(formData, "email"),
    address: optional(formData, "address"),
    notes: optional(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/clientes");
  revalidatePath("/dashboard/vendas");
}

export async function archiveCustomer(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ is_active: false }).eq("id", text(formData, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/clientes");
}

export async function createSupplier(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    company_id: auth.companyId,
    name: text(formData, "name"),
    document: optional(formData, "document"),
    contact_name: optional(formData, "contact_name"),
    phone: optional(formData, "phone"),
    email: optional(formData, "email"),
    notes: optional(formData, "notes"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/fornecedores");
}

export async function archiveSupplier(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", text(formData, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/fornecedores");
}

export async function createFinancialTransaction(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const status = text(formData, "status") === "paid" ? "paid" : "pending";
  const { error } = await supabase.from("financial_transactions").insert({
    company_id: auth.companyId,
    transaction_type: text(formData, "transaction_type") === "income" ? "income" : "expense",
    category: text(formData, "category"),
    description: text(formData, "description"),
    amount: Math.max(0.01, number(formData, "amount")),
    status,
    due_date: optional(formData, "due_date"),
    paid_at: status === "paid" ? new Date().toISOString() : null,
    created_by: auth.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/financeiro");
}

export async function markFinancialPaid(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const { data: before } = await supabase.from("financial_transactions").select("status,paid_at").eq("id", id).eq("company_id", auth.companyId!).single();
  if (!before) return { ok: false, error: "Movimentação não encontrada nesta empresa." };
  const { error } = await supabase.from("financial_transactions").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).eq("company_id", auth.companyId!);
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({ company_id: auth.companyId, user_id: auth.id, action: "update", entity_type: "financial_transaction", entity_id: id, details: { operation: "mark_paid", before } });
  revalidatePath("/dashboard"); revalidatePath("/dashboard/financeiro");
  return { ok: true };
}

export async function updateFinancialTransaction(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const amount = number(formData, "amount");
  if (amount <= 0) return { ok: false, error: "O valor deve ser maior que zero." };
  const result = await supabase.rpc("update_financial_transaction", {
    p_id: text(formData, "id"), p_transaction_date: text(formData, "transaction_date"),
    p_due_date: optional(formData, "due_date"), p_transaction_type: text(formData, "transaction_type"), p_category: text(formData, "category"),
    p_description: text(formData, "description"), p_status: text(formData, "status"), p_amount: amount,
  });
  if (result.error) return { ok: false, error: result.error.message };
  revalidatePath("/dashboard"); revalidatePath("/dashboard/financeiro"); revalidatePath("/dashboard/alertas");
  return { ok: true };
}

export async function deleteFinancialTransaction(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const result = await supabase.rpc("delete_financial_transaction", { p_id: text(formData, "id") });
  if (result.error) return { ok: false, error: result.error.message };
  revalidatePath("/dashboard"); revalidatePath("/dashboard/financeiro"); revalidatePath("/dashboard/alertas");
  return { ok: true };
}

export async function createReceivable(formData: FormData) {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { error } = await supabase.from("receivables").insert({
    company_id: auth.companyId,
    customer_id: text(formData, "customer_id"),
    description: text(formData, "description"),
    amount_total: Math.max(0.01, number(formData, "amount_total")),
    amount_paid: 0,
    due_date: text(formData, "due_date"),
    status: "open",
    created_by: auth.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devedores");
}

export async function recordReceivablePayment(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const result = await supabase.rpc("record_receivable_payment", {
    p_receivable_id: text(formData, "receivable_id"),
    p_amount: number(formData, "amount"),
    p_payment_method: text(formData, "payment_method") || "não informado",
  });
  if (result.error) throw new Error(result.error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devedores");
  revalidatePath("/dashboard/financeiro");
  revalidatePath("/dashboard/vendas");
}

export async function updateProduct(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const { error } = await supabase.from("products").update({
    sku: text(formData, "sku"),
    barcode: optional(formData, "barcode"),
    name: text(formData, "name"),
    description: optional(formData, "description"),
    category: optional(formData, "category"),
    cost: Math.max(0, number(formData, "cost")),
    price: Math.max(0, number(formData, "price")),
    min_stock: Math.max(0, number(formData, "min_stock")),
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/produtos");
  revalidatePath(`/dashboard/produtos/${id}`);
}

export async function updateCustomer(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const { error } = await supabase.from("customers").update({
    name: text(formData, "name"),
    document: optional(formData, "document"),
    phone: optional(formData, "phone"),
    email: optional(formData, "email"),
    address: optional(formData, "address"),
    notes: optional(formData, "notes"),
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${id}`);
}

export async function updateSupplier(formData: FormData) {
  await requireStoreUser();
  const supabase = await createClient();
  const id = text(formData, "id");
  const { error } = await supabase.from("suppliers").update({
    name: text(formData, "name"),
    document: optional(formData, "document"),
    contact_name: optional(formData, "contact_name"),
    phone: optional(formData, "phone"),
    email: optional(formData, "email"),
    notes: optional(formData, "notes"),
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/fornecedores");
  revalidatePath(`/dashboard/fornecedores/${id}`);
}
