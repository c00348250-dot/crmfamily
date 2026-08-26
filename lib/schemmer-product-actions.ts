"use server";

import { revalidatePath } from "next/cache";
import { requireStoreUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { createClient } from "@/lib/supabase/server";

type VariantInput = {
  sku?: string;
  color?: string;
  model?: string;
  stockQty?: number;
  minStock?: number;
  priceOverride?: number | null;
};

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

function safeSkuPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function parseVariants(formData: FormData): VariantInput[] {
  const raw = text(formData, "variants_json");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is VariantInput => Boolean(item && typeof item === "object"));
  } catch {
    throw new Error("As variações informadas são inválidas.");
  }
}

async function requireSchemmer() {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select("name,slug")
    .eq("id", auth.companyId!)
    .single();

  if (error || !company) throw new Error("Empresa não encontrada.");
  if (getCompanyBrand(company.slug, company.name).key !== "schemmer") {
    throw new Error("Cadastro com variações disponível apenas para a Schemmer Cell.");
  }

  return { auth, supabase };
}

function revalidateInventory() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/produtos");
  revalidatePath("/dashboard/vendas");
  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard/desempenho");
  revalidatePath("/dashboard/relatorios");
  revalidatePath("/caixa");
}

export async function createSchemmerProduct(formData: FormData) {
  const { auth, supabase } = await requireSchemmer();
  const usesVariants = text(formData, "stock_mode") === "variants";
  const variants = usesVariants ? parseVariants(formData) : [];
  const baseSku = text(formData, "sku");
  const name = text(formData, "name");

  if (!baseSku) throw new Error("Informe o SKU base do produto.");
  if (!name) throw new Error("Informe o nome do produto.");
  if (usesVariants && variants.length === 0) {
    throw new Error("Adicione pelo menos uma variação ao produto.");
  }

  const productPayload = {
    company_id: auth.companyId,
    sku: baseSku,
    barcode: optional(formData, "barcode"),
    name,
    description: optional(formData, "description"),
    category: optional(formData, "category"),
    cost: Math.max(0, numberValue(formData, "cost")),
    price: Math.max(0, numberValue(formData, "price")),
    stock_qty: 0,
    min_stock: usesVariants ? 0 : Math.max(0, numberValue(formData, "min_stock")),
  };

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert(productPayload)
    .select("id")
    .single();

  if (productError || !product) throw new Error(productError?.message ?? "Não foi possível cadastrar o produto.");

  try {
    if (!usesVariants) {
      const initialStock = Math.max(0, numberValue(formData, "stock_qty"));
      if (initialStock > 0) {
        const stockResult = await supabase.rpc("adjust_stock", {
          p_product_id: product.id,
          p_quantity_change: initialStock,
          p_reason: "Estoque inicial",
        });
        if (stockResult.error) throw new Error(stockResult.error.message);
      }
    } else {
      const rows = variants.map((variant, index) => {
        const color = typeof variant.color === "string" ? variant.color.trim() : "";
        const model = typeof variant.model === "string" ? variant.model.trim() : "";
        const label = safeSkuPart(color || model || "VAR");
        const generatedSku = `${baseSku}-${label || "VAR"}-${index + 1}`;
        const providedSku = typeof variant.sku === "string" ? variant.sku.trim() : "";
        const rawPriceOverride = variant.priceOverride;
        const parsedPriceOverride = rawPriceOverride == null ? null : Number(rawPriceOverride);

        return {
          company_id: auth.companyId,
          product_id: product.id,
          sku: providedSku || generatedSku,
          color: color || null,
          model: model || null,
          size: null,
          flavor: null,
          volume: null,
          stock_qty: Math.max(0, Number(variant.stockQty) || 0),
          min_stock: Math.max(0, Number(variant.minStock) || 0),
          price_override: parsedPriceOverride != null && Number.isFinite(parsedPriceOverride) && parsedPriceOverride >= 0 ? parsedPriceOverride : null,
        };
      });

      const { error: variantError } = await supabase.from("product_variants").insert(rows);
      if (variantError) throw new Error(variantError.message);
    }
  } catch (error) {
    await supabase.from("products").delete().eq("id", product.id);
    throw error;
  }

  revalidateInventory();
}

export async function adjustSchemmerVariantStock(formData: FormData) {
  const { auth, supabase } = await requireSchemmer();
  const variantId = text(formData, "variant_id");
  const change = numberValue(formData, "quantity_change");

  if (!variantId || change === 0) throw new Error("Informe uma alteração de estoque válida.");

  const { data: variant, error: readError } = await supabase
    .from("product_variants")
    .select("id,company_id,stock_qty")
    .eq("id", variantId)
    .eq("company_id", auth.companyId!)
    .single();

  if (readError || !variant) throw new Error("Variação não encontrada.");

  const nextStock = Number(variant.stock_qty) + change;
  if (nextStock < 0) throw new Error("O estoque da variação não pode ficar negativo.");

  const { error: updateError } = await supabase
    .from("product_variants")
    .update({ stock_qty: nextStock })
    .eq("id", variantId)
    .eq("company_id", auth.companyId!);

  if (updateError) throw new Error(updateError.message);

  await supabase.from("audit_logs").insert({
    company_id: auth.companyId,
    user_id: auth.id,
    action: "stock",
    entity_type: "product_variant",
    entity_id: variantId,
    details: { change, stock: nextStock, source: "schemmer_products" },
  });

  revalidateInventory();
}
