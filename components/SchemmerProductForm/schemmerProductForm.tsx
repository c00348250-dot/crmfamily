"use client";

import { useMemo, useState } from "react";
import { createSchemmerProduct } from "@/lib/schemmer-product-actions";

type VariantRow = {
  id: number;
  sku: string;
  color: string;
  model: string;
  stockQty: string;
  minStock: string;
  priceOverride: string;
};

function newVariant(id: number): VariantRow {
  return {
    id,
    sku: "",
    color: "",
    model: "",
    stockQty: "0",
    minStock: "0",
    priceOverride: "",
  };
}

export function SchemmerProductForm() {
  const [mode, setMode] = useState<"simple" | "variants">("simple");
  const [nextId, setNextId] = useState(2);
  const [variants, setVariants] = useState<VariantRow[]>([newVariant(1)]);

  const variantsJson = useMemo(
    () => JSON.stringify(variants.map(({ id: _id, ...variant }) => ({
      ...variant,
      stockQty: Number(variant.stockQty || 0),
      minStock: Number(variant.minStock || 0),
      priceOverride: variant.priceOverride === "" ? null : Number(variant.priceOverride),
    }))),
    [variants],
  );

  function updateVariant(id: number, key: keyof Omit<VariantRow, "id">, value: string) {
    setVariants((current) => current.map((variant) => variant.id === id ? { ...variant, [key]: value } : variant));
  }

  function addVariant() {
    setVariants((current) => [...current, newVariant(nextId)]);
    setNextId((value) => value + 1);
  }

  function removeVariant(id: number) {
    setVariants((current) => current.length === 1 ? current : current.filter((variant) => variant.id !== id));
  }

  return (
    <form action={createSchemmerProduct} className="form-grid">
      <label>SKU base<input name="sku" required placeholder="Ex.: CAP-IP12" /></label>
      <label>Código de barras<input name="barcode" placeholder="Opcional" /></label>
      <label className="wide">Nome<input name="name" required placeholder="Ex.: Capa para iPhone 12" /></label>
      <label>Categoria<input name="category" placeholder="Capas, películas, cabos..." /></label>
      <label>Custo (R$)<input name="cost" type="number" step="0.01" min="0" defaultValue="0" /></label>
      <label>Preço de venda (R$)<input name="price" type="number" step="0.01" min="0" required /></label>
      <label className="wide">Descrição<textarea name="description" /></label>

      <div className="wide">
        <span className="eyebrow">CONTROLE DE ESTOQUE</span>
        <div className="toolbar section-gap-small">
          <button type="button" className={mode === "simple" ? "primary" : "secondary"} onClick={() => setMode("simple")}>Produto simples</button>
          <button type="button" className={mode === "variants" ? "primary" : "secondary"} onClick={() => setMode("variants")}>Produto com variações</button>
        </div>
        <input type="hidden" name="stock_mode" value={mode} />
      </div>

      {mode === "simple" ? (
        <>
          <label>Estoque inicial<input name="stock_qty" type="number" step="0.001" min="0" defaultValue="0" /></label>
          <label>Estoque mínimo<input name="min_stock" type="number" step="0.001" min="0" defaultValue="0" /></label>
        </>
      ) : (
        <div className="wide">
          <input type="hidden" name="variants_json" value={variantsJson} />
          <div className="panel-head"><h3>Variações do produto</h3><button type="button" className="secondary" onClick={addVariant}>+ Adicionar variação</button></div>
          <div className="alert-stack">
            {variants.map((variant, index) => (
              <div className="panel-body" key={variant.id} style={{ border: "1px solid var(--border)", borderRadius: 12 }}>
                <div className="form-grid">
                  <label>Cor<input value={variant.color} onChange={(event) => updateVariant(variant.id, "color", event.target.value)} placeholder="Ex.: Branca" /></label>
                  <label>Modelo/compatibilidade<input value={variant.model} onChange={(event) => updateVariant(variant.id, "model", event.target.value)} placeholder="Ex.: iPhone 12" /></label>
                  <label>Quantidade<input type="number" min="0" step="0.001" value={variant.stockQty} onChange={(event) => updateVariant(variant.id, "stockQty", event.target.value)} /></label>
                  <label>Estoque mínimo<input type="number" min="0" step="0.001" value={variant.minStock} onChange={(event) => updateVariant(variant.id, "minStock", event.target.value)} /></label>
                  <label>SKU da variação<input value={variant.sku} onChange={(event) => updateVariant(variant.id, "sku", event.target.value)} placeholder="Opcional — gerado automaticamente" /></label>
                  <label>Preço específico<input type="number" min="0" step="0.01" value={variant.priceOverride} onChange={(event) => updateVariant(variant.id, "priceOverride", event.target.value)} placeholder="Opcional" /></label>
                  <div className="form-actions"><button type="button" className="danger" onClick={() => removeVariant(variant.id)} disabled={variants.length === 1}>Remover variação {index + 1}</button></div>
                </div>
              </div>
            ))}
          </div>
          <p className="callout section-gap">Cada variação terá estoque próprio. O PDV baixa somente a cor/modelo vendido.</p>
        </div>
      )}

      <div className="form-actions"><button className="primary">Cadastrar produto</button></div>
    </form>
  );
}
