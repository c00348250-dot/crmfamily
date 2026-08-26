import { getCompanyBrand } from "@/lib/company-brand";
import { relationOne } from "@/lib/supabase/relation";
import type { AuthContext } from "@/lib/types";
import { createPosRepository } from "@/modules/pos/pos.repository";
import type {
  CashSessionSummary,
  PosAgendaItem,
  PosCatalogItem,
  PosCustomer,
  PosHistorySale,
  PosPaymentMethod,
  PosReceipt,
} from "@/modules/pos/pos.types";
import { createClient } from "@/lib/supabase/server";

type DatabaseClient = Awaited<ReturnType<typeof createClient>>;
type Relation<T> = T | T[] | null;

type ProductRow = { id: string; name: string; sku: string; barcode: string | null; price: number | string; stock_qty: number | string; category: string | null };
type CustomerRow = { id: string; name: string; phone: string | null };
type VariantRow = {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  model: string | null;
  flavor: string | null;
  volume: string | null;
  stock_qty: number | string;
  price_override: number | string | null;
  products: Relation<{ id: string; name: string; price: number | string }>;
};
type BundleRow = { id: string; name: string; sku: string; price: number | string; description: string | null };
type DeviceRow = { id: string; brand: string; model: string; imei: string | null; serial_number: string | null; color: string | null; sale_price: number | string; status: string };
type PaymentRow = { amount: number | string; payment_method: string; status: string; sales: Relation<{ status: string; total: number | string }> };
type MovementRow = { amount: number | string; movement_type: string };
type SessionSaleRow = { id: string; total: number | string; status: string };
type HistoryRow = {
  id: string;
  sale_number: number | string;
  sold_at: string;
  total: number | string;
  amount_paid: number | string;
  payment_status: string;
  status: string;
  source: string;
  cash_session_id: string | null;
  customers: Relation<{ name: string }>;
};
type PetAppointmentRow = {
  id: string;
  service_type: string;
  scheduled_at: string;
  status: string;
  price: number | string;
  customer_id: string;
  paid_sale_id: string | null;
  pets: Relation<{ name: string }>;
  customers: Relation<{ name: string; phone: string | null }>;
};
type ServiceOrderRow = {
  id: string;
  order_number: number | string;
  device_brand: string;
  device_model: string;
  quote_amount: number | string;
  status: string;
  customer_id: string | null;
  paid_sale_id: string | null;
  customers: Relation<{ name: string; phone: string | null }>;
};

function saoPauloDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function requireCompany(auth: AuthContext) {
  if (!auth.companyId) throw new Error("Este acesso não está vinculado a uma empresa.");
  return auth.companyId;
}

function paymentLabel(method: PosPaymentMethod) {
  const labels: Record<PosPaymentMethod, string> = {
    cash: "Dinheiro",
    pix: "Pix",
    debit_card: "Cartão de débito",
    credit_card: "Cartão de crédito",
    transfer: "Transferência",
    other: "Outro",
  };
  return labels[method];
}

export function createPosService(supabase: DatabaseClient, auth: AuthContext) {
  const repository = createPosRepository(supabase);
  const companyId = requireCompany(auth);

  async function getSessionSummary(): Promise<CashSessionSummary | null> {
    const session = await repository.getOpenSession(companyId, auth.id);
    if (!session) return null;

    const [paymentsRaw, movementsRaw, salesRaw] = await Promise.all([
      repository.getSessionPayments(session.id),
      repository.getSessionMovements(session.id),
      repository.getSessionSales(session.id),
    ]);
    const payments = paymentsRaw as unknown as PaymentRow[];
    const movements = movementsRaw as unknown as MovementRow[];
    const sales = salesRaw as unknown as SessionSaleRow[];

    const cashSales = payments.reduce((sum, payment) => {
      const sale = relationOne(payment.sales);
      return payment.payment_method === "cash" && payment.status === "paid" && sale?.status === "completed"
        ? sum + Number(payment.amount)
        : sum;
    }, 0);
    const supplies = movements.filter((m) => m.movement_type === "supply").reduce((sum, m) => sum + Number(m.amount), 0);
    const withdrawals = movements.filter((m) => m.movement_type === "withdrawal").reduce((sum, m) => sum + Number(m.amount), 0);
    const refunds = movements.filter((m) => m.movement_type === "refund").reduce((sum, m) => sum + Number(m.amount), 0);
    const completedSales = sales.filter((sale) => sale.status === "completed");
    const totalSales = completedSales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const openingAmount = Number(session.opening_amount);

    return {
      id: session.id,
      openingAmount,
      openedAt: session.opened_at,
      cashSales,
      supplies,
      withdrawals,
      refunds,
      expectedCash: openingAmount + cashSales + supplies - withdrawals - refunds,
      totalSales,
      saleCount: completedSales.length,
    };
  }

  async function getBase() {
    const [company, customersRaw] = await Promise.all([
      repository.getCompany(companyId),
      repository.getCustomers(companyId),
    ]);
    const brand = getCompanyBrand(company.slug, company.name);
    const customers = (customersRaw as unknown as CustomerRow[]).map<PosCustomer>((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    }));
    return { company, brand, customers };
  }

  function pushVariants(catalog: PosCatalogItem[], variantsRaw: unknown[]) {
    for (const variant of variantsRaw as VariantRow[]) {
      const product = relationOne(variant.products);
      if (!product) continue;
      const details = [variant.color, variant.size, variant.model, variant.flavor, variant.volume].filter(Boolean).join(" • ");
      catalog.push({
        key: `variant:${variant.id}`,
        sourceType: "variant",
        sourceId: variant.id,
        name: `${product.name} — ${variant.color || variant.model || variant.sku}`,
        subtitle: details || `Variação ${variant.sku}`,
        sku: variant.sku,
        barcode: null,
        price: Number(variant.price_override ?? product.price),
        stock: Number(variant.stock_qty),
      });
    }
  }

  async function getCatalog(brandKey: string): Promise<PosCatalogItem[]> {
    const productsRaw = await repository.getProducts(companyId);
    const catalog: PosCatalogItem[] = (productsRaw as unknown as ProductRow[]).map((product) => ({
      key: `product:${product.id}`,
      sourceType: "product",
      sourceId: product.id,
      name: product.name,
      subtitle: product.category || "Produto",
      sku: product.sku,
      barcode: product.barcode,
      price: Number(product.price),
      stock: Number(product.stock_qty),
    }));

    if (brandKey === "sedux" || brandKey === "schemmer") {
      const variantsRaw = await repository.getVariants(companyId);
      pushVariants(catalog, variantsRaw as unknown[]);
    }

    if (brandKey === "sedux") {
      const bundlesRaw = await repository.getBundles(companyId);
      for (const bundle of bundlesRaw as unknown as BundleRow[]) {
        catalog.push({
          key: `bundle:${bundle.id}`,
          sourceType: "bundle",
          sourceId: bundle.id,
          name: bundle.name,
          subtitle: bundle.description || "Kit",
          sku: bundle.sku,
          barcode: null,
          price: Number(bundle.price),
          stock: 999999,
        });
      }
    }

    if (brandKey === "schemmer") {
      const devicesRaw = await repository.getDeviceUnits(companyId);
      for (const device of devicesRaw as unknown as DeviceRow[]) {
        catalog.push({
          key: `device_unit:${device.id}`,
          sourceType: "device_unit",
          sourceId: device.id,
          name: `${device.brand} ${device.model}`,
          subtitle: [device.imei ? `IMEI ${device.imei}` : null, device.serial_number ? `Série ${device.serial_number}` : null, device.color].filter(Boolean).join(" • ") || "Aparelho por unidade",
          sku: device.imei || device.serial_number,
          barcode: null,
          price: Number(device.sale_price),
          stock: 1,
        });
      }
    }

    return catalog;
  }

  async function loadHome(preselect?: { sourceType: "pet_appointment" | "service_order"; sourceId: string } | null) {
    const [{ company, brand, customers }, session, catalog] = await Promise.all([
      getBase(),
      getSessionSummary(),
      repository.getCompany(companyId).then((company) => getCatalog(getCompanyBrand(company.slug, company.name).key)),
    ]);

    let preselectedItem: PosCatalogItem | null = null;
    if (preselect) {
      const source = await repository.getSourceItem(preselect.sourceType, preselect.sourceId, companyId);
      if (source.type === "pet_appointment") {
        const row = source.data as unknown as PetAppointmentRow;
        const pet = relationOne(row.pets);
        const customer = relationOne(row.customers);
        if (row.status === "ready" && !row.paid_sale_id) {
          preselectedItem = {
            key: `pet_appointment:${row.id}`,
            sourceType: "pet_appointment",
            sourceId: row.id,
            name: row.service_type,
            subtitle: pet ? `Pet: ${pet.name}` : "Serviço pet",
            sku: null,
            barcode: null,
            price: Number(row.price),
            stock: 1,
            customerId: row.customer_id,
            customerName: customer?.name ?? null,
          };
        }
      } else {
        const row = source.data as unknown as ServiceOrderRow;
        const customer = relationOne(row.customers);
        if (row.status === "ready" && !row.paid_sale_id) {
          preselectedItem = {
            key: `service_order:${row.id}`,
            sourceType: "service_order",
            sourceId: row.id,
            name: `OS #${row.order_number} — ${row.device_brand} ${row.device_model}`,
            subtitle: "Assistência técnica pronta para retirada",
            sku: null,
            barcode: null,
            price: Number(row.quote_amount),
            stock: 1,
            customerId: row.customer_id,
            customerName: customer?.name ?? null,
          };
        }
      }
    }

    return { company, brand, customers, session, catalog, preselectedItem };
  }

  async function loadAgenda(): Promise<{ brandKey: string; brandName: string; items: PosAgendaItem[] }> {
    const company = await repository.getCompany(companyId);
    const brand = getCompanyBrand(company.slug, company.name);
    const items: PosAgendaItem[] = [];

    if (brand.key === "housepet") {
      const today = saoPauloDateKey();
      const start = new Date(`${today}T00:00:00-03:00`).toISOString();
      const end = new Date(`${today}T23:59:59.999-03:00`).toISOString();
      const rows = await repository.getPetAppointments(companyId, start, end) as unknown as PetAppointmentRow[];
      for (const row of rows) {
        const pet = relationOne(row.pets);
        const customer = relationOne(row.customers);
        items.push({
          id: row.id,
          sourceType: "pet_appointment",
          title: row.service_type,
          subject: pet?.name ?? "Pet",
          customerId: row.customer_id,
          customerName: customer?.name ?? "Cliente",
          customerPhone: customer?.phone ?? null,
          scheduledAt: row.scheduled_at,
          status: row.status,
          price: Number(row.price),
          readyToCharge: row.status === "ready" && !row.paid_sale_id,
        });
      }
    }

    if (brand.key === "schemmer") {
      const rows = await repository.getReadyServiceOrders(companyId) as unknown as ServiceOrderRow[];
      for (const row of rows) {
        const customer = relationOne(row.customers);
        items.push({
          id: row.id,
          sourceType: "service_order",
          title: `OS #${row.order_number}`,
          subject: `${row.device_brand} ${row.device_model}`,
          customerId: row.customer_id,
          customerName: customer?.name ?? "Cliente não identificado",
          customerPhone: customer?.phone ?? null,
          scheduledAt: null,
          status: row.status,
          price: Number(row.quote_amount),
          readyToCharge: row.status === "ready" && !row.paid_sale_id,
        });
      }
    }

    return { brandKey: brand.key, brandName: brand.name, items };
  }

  async function loadHistory(): Promise<{ session: CashSessionSummary | null; sales: PosHistorySale[] }> {
    const [session, rowsRaw] = await Promise.all([getSessionSummary(), repository.getRecentSales(companyId)]);
    const sales = (rowsRaw as unknown as HistoryRow[]).map<PosHistorySale>((sale) => ({
      id: sale.id,
      saleNumber: Number(sale.sale_number),
      soldAt: sale.sold_at,
      customerName: relationOne(sale.customers)?.name ?? "Não identificado",
      total: Number(sale.total),
      amountPaid: Number(sale.amount_paid),
      paymentStatus: sale.payment_status,
      status: sale.status,
      source: sale.source,
      cashSessionId: sale.cash_session_id,
    }));
    return { session, sales };
  }

  async function loadReceipt(saleId: string): Promise<PosReceipt> {
    const [company, receipt] = await Promise.all([repository.getCompany(companyId), repository.getReceipt(companyId, saleId)]);
    const brand = getCompanyBrand(company.slug, company.name);
    type ReceiptSaleRow = {
      id: string;
      sale_number: number | string;
      sold_at: string;
      subtotal: number | string;
      discount: number | string;
      total: number | string;
      amount_paid: number | string;
      payment_status: string;
      status: string;
      customers: Relation<{ name: string }>;
    };
    type ReceiptItemRow = { id: string; product_name: string; quantity: number | string; unit_price: number | string; line_total: number | string };
    type ReceiptPaymentRow = { id: string; payment_method: PosPaymentMethod; amount: number | string; status: string };
    const sale = receipt.sale as unknown as ReceiptSaleRow;

    return {
      companyName: company.name,
      companyLabel: brand.businessLabel,
      saleId: sale.id,
      saleNumber: Number(sale.sale_number),
      soldAt: sale.sold_at,
      customerName: relationOne(sale.customers)?.name ?? "Não identificado",
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      total: Number(sale.total),
      amountPaid: Number(sale.amount_paid),
      paymentStatus: sale.payment_status,
      status: sale.status,
      items: (receipt.items as unknown as ReceiptItemRow[]).map((item) => ({
        id: item.id,
        name: item.product_name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      })),
      payments: (receipt.payments as unknown as ReceiptPaymentRow[]).map((payment) => ({
        id: payment.id,
        method: payment.payment_method,
        amount: Number(payment.amount),
        status: payment.status,
      })),
    };
  }

  return {
    loadHome,
    loadAgenda,
    loadHistory,
    loadReceipt,
    getSessionSummary,
    paymentLabel,
    openSession: repository.openSession,
    closeSession: repository.closeSession,
    addMovement: repository.addMovement,
    createSale: repository.createSale,
    cancelSale: repository.cancelSale,
  };
}
