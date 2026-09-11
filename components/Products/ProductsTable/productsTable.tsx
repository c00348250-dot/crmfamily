"use client";

import { useState } from "react";
import Link from "next/link";
import { archiveProduct, deleteProduct, unarchiveProduct } from "@/lib/actions";
import { brl } from "@/lib/format";
import styles from "./productsTable.module.css";

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  cost?: number | null;
  price: number;
  stock_qty: number;
  min_stock: number;
  is_active: boolean;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  stock_qty: number;
  min_stock: number;
};

type ProductsTableProps = {
  products: ProductRow[];
  variants: ProductVariantRow[];
};

export function ProductsTable({ products, variants }: ProductsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ativos" | "arquivados" | "todos">("ativos");

  const activeCount = products.filter((p) => p.is_active).length;
  const archivedCount = products.filter((p) => !p.is_active).length;
  const totalCount = products.length;

  const variantsFor = (productId: string) => variants.filter((v) => v.product_id === productId);

  const filteredProducts = products.filter((product) => {
    // Status filter
    if (statusFilter === "ativos" && !product.is_active) return false;
    if (statusFilter === "arquivados" && product.is_active) return false;

    // Search query live filter
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = (product.name ?? "").toLowerCase().includes(q);
    const skuMatch = (product.sku ?? "").toLowerCase().includes(q);
    const categoryMatch = (product.category ?? "").toLowerCase().includes(q);
    return nameMatch || skuMatch || categoryMatch;
  });

  const handleDeleteSubmit = (e: React.FormEvent<HTMLFormElement>, productName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o produto "${productName}"? esta ação não poderá ser desfeita.`)) {
      e.preventDefault();
    }
  };

  const handleArchiveSubmit = (e: React.FormEvent<HTMLFormElement>, productName: string) => {
    if (!window.confirm(`Deseja arquivar o produto "${productName}"?`)) {
      e.preventDefault();
    }
  };

  const handleUnarchiveSubmit = (e: React.FormEvent<HTMLFormElement>, productName: string) => {
    if (!window.confirm(`Deseja reativar o produto "${productName}"?`)) {
      e.preventDefault();
    }
  };

  return (
    <section className="panel section-gap">
      <div className="panel-head">
        <h2>Catálogo de produtos</h2>
        <span className="badge">{filteredProducts.length} exibidos</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <svg
            className={styles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Filtrar por nome do produto, SKU ou categoria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <nav className={styles.filterNav} aria-label="Filtro de status dos produtos">
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === "ativos" ? styles.active : ""}`}
            onClick={() => setStatusFilter("ativos")}
          >
            <span>Ativos</span>
            <span className={styles.badgeCount}>{activeCount}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === "arquivados" ? styles.active : ""}`}
            onClick={() => setStatusFilter("arquivados")}
          >
            <span>Arquivados</span>
            <span className={styles.badgeCount}>{archivedCount}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${statusFilter === "todos" ? styles.active : ""}`}
            onClick={() => setStatusFilter("todos")}
          >
            <span>Todos</span>
            <span className={styles.badgeCount}>{totalCount}</span>
          </button>
        </nav>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Categoria</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>Estoque</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => {
              const productVariants = variantsFor(p.id);
              const variantStock = productVariants.reduce((total, variant) => total + Number(variant.stock_qty), 0);
              const hasVariants = productVariants.length > 0;
              const low = hasVariants
                ? productVariants.some((variant) => Number(variant.stock_qty) <= Number(variant.min_stock))
                : Number(p.stock_qty) <= Number(p.min_stock);
              const out = hasVariants
                ? productVariants.some((variant) => Number(variant.stock_qty) <= 0)
                : Number(p.stock_qty) <= 0;
              const stockLabel = hasVariants ? variantStock : p.stock_qty;

              return (
                <tr key={p.id} className={!p.is_active ? "archived-row" : low ? (out ? "low-stock-row critical" : "low-stock-row") : ""}>
                  <td>
                    <strong>{p.name}</strong>
                    {!p.is_active ? (
                      <small className="stock-row-note danger">Produto Arquivado</small>
                    ) : hasVariants ? (
                      <small className="stock-row-note">{productVariants.length} variação(ões)</small>
                    ) : low ? (
                      <small className="stock-row-note">Reposição necessária</small>
                    ) : null}
                  </td>
                  <td>{p.sku}</td>
                  <td>{p.category ?? "—"}</td>
                  <td>{brl(p.cost)}</td>
                  <td className="amount">{brl(p.price)}</td>
                  <td>
                    <strong className={low && p.is_active ? "stock-value-alert" : ""}>{stockLabel}</strong>
                    <small className="stock-minimum">{hasVariants ? "total das variações" : `mín. ${p.min_stock}`}</small>
                  </td>
                  <td>
                    {!p.is_active ? (
                      <span className="badge warning">Arquivado</span>
                    ) : (
                      <span className={`badge ${out ? "danger" : low ? "warning" : "success"}`}>
                        {out ? (hasVariants ? "Variação sem estoque" : "Sem estoque") : low ? "Estoque mínimo" : "Normal"}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="toolbar">
                      <Link className="secondary" href={`/dashboard/produtos/${p.id}`}>
                        Editar
                      </Link>
                      {p.is_active ? (
                        <form action={archiveProduct} onSubmit={(e) => handleArchiveSubmit(e, p.name)}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="secondary">
                            Arquivar
                          </button>
                        </form>
                      ) : (
                        <form action={unarchiveProduct} onSubmit={(e) => handleUnarchiveSubmit(e, p.name)}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="secondary">
                            Reativar
                          </button>
                        </form>
                      )}
                      <form action={deleteProduct} onSubmit={(e) => handleDeleteSubmit(e, p.name)}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="danger">
                          Excluir
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredProducts.length ? (
              <tr>
                <td colSpan={8} className="empty">
                  {searchQuery ? `Nenhum produto encontrado para "${searchQuery}".` : "Nenhum produto cadastrado neste filtro."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
