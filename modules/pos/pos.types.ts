export type PosSourceType =
  | "product"
  | "variant"
  | "bundle"
  | "device_unit"
  | "service_order"
  | "pet_appointment";

export type PosPaymentMethod = "cash" | "pix" | "debit_card" | "credit_card" | "transfer" | "other";

export type PosCatalogItem = {
  key: string;
  sourceType: PosSourceType;
  sourceId: string;
  name: string;
  subtitle: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  stock: number;
  customerId?: string | null;
  customerName?: string | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
};

export type PosCartItem = {
  key: string;
  sourceType: PosSourceType;
  sourceId: string;
  name: string;
  subtitle: string;
  price: number;
  quantity: number;
  maxQuantity: number;
  customerId?: string | null;
  customerName?: string | null;
};

export type PosPaymentInput = {
  payment_method: PosPaymentMethod;
  amount: number;
};

export type PosSaleItemInput = {
  source_type: PosSourceType;
  source_id: string;
  quantity: number;
};

export type CashSessionSummary = {
  id: string;
  openingAmount: number;
  openedAt: string;
  cashSales: number;
  supplies: number;
  withdrawals: number;
  refunds: number;
  expectedCash: number;
  totalSales: number;
  saleCount: number;
};

export type PosAgendaItem = {
  id: string;
  sourceType: "pet_appointment" | "service_order";
  title: string;
  subject: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  scheduledAt: string | null;
  status: string;
  price: number;
  readyToCharge: boolean;
};

export type PosHistorySale = {
  id: string;
  saleNumber: number;
  soldAt: string;
  customerName: string;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  status: string;
  source: string;
  cashSessionId: string | null;
};

export type PosReceipt = {
  companyName: string;
  companyLabel: string;
  saleId: string;
  saleNumber: number;
  soldAt: string;
  customerName: string;
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  status: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  payments: Array<{
    id: string;
    method: PosPaymentMethod;
    amount: number;
    status: string;
  }>;
};
