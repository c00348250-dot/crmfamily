import type { PosPaymentInput, PosPaymentMethod, PosSaleItemInput, PosSourceType } from "@/modules/pos/pos.types";

const sourceTypes: readonly PosSourceType[] = ["product","variant","bundle","device_unit","service_order","pet_appointment"];
const paymentMethods: readonly PosPaymentMethod[] = ["cash","pix","debit_card","credit_card","transfer","other"];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Dados inválidos.");
  return value as Record<string, unknown>;
}

function money(value: unknown, label: string, allowZero = true) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) throw new Error(`${label} inválido.`);
  return Math.round(parsed * 100) / 100;
}

function text(value: unknown, label: string, required = false) {
  const parsed = String(value ?? "").trim();
  if (required && !parsed) throw new Error(`Informe ${label}.`);
  return parsed;
}

export function parseSessionPayload(value: unknown) {
  const data = object(value);
  const action = text(data.action, "a ação", true);
  if (action === "open") {
    return {
      action: "open" as const,
      openingAmount: money(data.openingAmount, "Valor inicial"),
      notes: text(data.notes, "as observações") || null,
    };
  }
  if (action === "close") {
    return {
      action: "close" as const,
      sessionId: text(data.sessionId, "o caixa", true),
      closingAmount: money(data.closingAmount, "Valor contado"),
      notes: text(data.notes, "as observações") || null,
    };
  }
  throw new Error("Ação de caixa inválida.");
}

export function parseCashMovementPayload(value: unknown): {
  sessionId: string;
  movementType: "supply" | "withdrawal";
  amount: number;
  description: string;
} {
  const data = object(value);
  const rawMovementType = text(data.movementType, "o tipo de movimento", true);
  if (rawMovementType !== "supply" && rawMovementType !== "withdrawal") throw new Error("Tipo de movimento inválido.");
  const movementType: "supply" | "withdrawal" = rawMovementType;
  return {
    sessionId: text(data.sessionId, "o caixa", true),
    movementType,
    amount: money(data.amount, "Valor", false),
    description: text(data.description, "a descrição", true),
  };
}

export function parseSalePayload(value: unknown) {
  const data = object(value);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const rawPayments = Array.isArray(data.payments) ? data.payments : [];
  if (!rawItems.length) throw new Error("Adicione ao menos um item ao carrinho.");

  const items: PosSaleItemInput[] = rawItems.map((raw) => {
    const item = object(raw);
    const sourceType = text(item.source_type, "o tipo do item", true) as PosSourceType;
    if (!sourceTypes.includes(sourceType)) throw new Error("Tipo de item inválido.");
    const quantity = Number(item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
    return {
      source_type: sourceType,
      source_id: text(item.source_id, "o item", true),
      quantity,
    };
  });

  const payments: PosPaymentInput[] = rawPayments.map((raw) => {
    const payment = object(raw);
    const method = text(payment.payment_method, "a forma de pagamento", true) as PosPaymentMethod;
    if (!paymentMethods.includes(method)) throw new Error("Forma de pagamento inválida.");
    return {
      payment_method: method,
      amount: money(payment.amount, "Valor do pagamento", false),
    };
  });

  return {
    sessionId: text(data.sessionId, "o caixa", true),
    customerId: text(data.customerId, "o cliente") || null,
    discount: money(data.discount, "Desconto"),
    dueDate: text(data.dueDate, "o vencimento") || null,
    items,
    payments,
  };
}

export function parseCancelSalePayload(value: unknown) {
  const data = object(value);
  return {
    reason: text(data.reason, "o motivo do cancelamento", true),
    refundSessionId: text(data.refundSessionId, "o caixa") || null,
  };
}
