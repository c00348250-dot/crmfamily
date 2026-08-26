export type CompanyBrand = {
  key: "family" | "sedux" | "schemmer" | "housepet";
  name: string;
  short: string;
  className: string;
  businessLabel: string;
};

export function getCompanyBrand(slug?: string | null, name?: string | null): CompanyBrand {
  const normalized = (slug ?? "").toLowerCase();

  if (["sedux", "sexy-shop"].includes(normalized) || name?.toLowerCase().includes("sedux")) {
    return { key: "sedux", name: "Sedux", short: "SX", className: "theme-sedux", businessLabel: "Gestão da loja" };
  }

  if (["schemmer-cell", "loja-celular"].includes(normalized) || name?.toLowerCase().includes("schemmer")) {
    return { key: "schemmer", name: "Schemmer Cell", short: "SC", className: "theme-schemmer", businessLabel: "Assistência técnica & celulares" };
  }

  if (["house-pet", "petshop"].includes(normalized) || name?.toLowerCase().includes("house pet")) {
    return { key: "housepet", name: "House Pet", short: "HP", className: "theme-housepet", businessLabel: "Estética e cuidado animal" };
  }

  return { key: "family", name: name ?? "CRM Family", short: "CF", className: "theme-family", businessLabel: "Gestão multiloja" };
}
