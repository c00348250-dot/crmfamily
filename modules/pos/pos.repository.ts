import { createClient } from "@/lib/supabase/server";

type DatabaseClient = Awaited<ReturnType<typeof createClient>>;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, fallbackMessage: string): T {
  if (result.error) throw new Error(result.error.message || fallbackMessage);
  if (result.data == null) throw new Error(fallbackMessage);
  return result.data;
}

export function createPosRepository(supabase: DatabaseClient) {
  return {
    async getCompany(companyId: string) {
      const result = await supabase.from("companies").select("id,name,slug,business_type").eq("id", companyId).single();
      return unwrap(result, "Empresa não encontrada.");
    },

    async getOpenSession(companyId: string, userId: string) {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("id,opening_amount,opened_at,status,opened_by")
        .eq("company_id", companyId)
        .eq("opened_by", userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },

    async getSessionPayments(sessionId: string) {
      const { data, error } = await supabase
        .from("sale_payments")
        .select("amount,payment_method,status,sales(status,total)")
        .eq("cash_session_id", sessionId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getSessionMovements(sessionId: string) {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("amount,movement_type")
        .eq("cash_session_id", sessionId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getSessionSales(sessionId: string) {
      const { data, error } = await supabase
        .from("sales")
        .select("id,total,status")
        .eq("cash_session_id", sessionId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getProducts(companyId: string) {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,barcode,price,stock_qty,category")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .gt("stock_qty", 0)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getCustomers(companyId: string) {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getVariants(companyId: string) {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,sku,color,size,model,flavor,volume,stock_qty,price_override,products(id,name,price)")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .gt("stock_qty", 0)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getBundles(companyId: string) {
      const { data, error } = await supabase
        .from("bundles")
        .select("id,name,sku,price,description")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getDeviceUnits(companyId: string) {
      const { data, error } = await supabase
        .from("device_units")
        .select("id,brand,model,imei,serial_number,color,sale_price,status")
        .eq("company_id", companyId)
        .eq("status", "in_stock")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getReadyServiceOrders(companyId: string) {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id,order_number,device_brand,device_model,quote_amount,status,customer_id,paid_sale_id,customers(name,phone)")
        .eq("company_id", companyId)
        .eq("status", "ready")
        .is("paid_sale_id", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getPetAppointments(companyId: string, startIso: string, endIso: string) {
      const { data, error } = await supabase
        .from("pet_appointments")
        .select("id,service_type,scheduled_at,status,price,customer_id,paid_sale_id,pets(name),customers(name,phone)")
        .eq("company_id", companyId)
        .gte("scheduled_at", startIso)
        .lte("scheduled_at", endIso)
        .neq("status", "cancelled")
        .order("scheduled_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getRecentSales(companyId: string, limit = 80) {
      const { data, error } = await supabase
        .from("sales")
        .select("id,sale_number,sold_at,total,amount_paid,payment_status,status,source,cash_session_id,customers(name)")
        .eq("company_id", companyId)
        .eq("source", "pos")
        .order("sold_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },

    async getSourceItem(sourceType: "pet_appointment" | "service_order", sourceId: string, companyId: string) {
      if (sourceType === "pet_appointment") {
        const result = await supabase
          .from("pet_appointments")
          .select("id,service_type,price,status,customer_id,paid_sale_id,pets(name),customers(name,phone)")
          .eq("company_id", companyId)
          .eq("id", sourceId)
          .single();
        return { type: "pet_appointment" as const, data: unwrap(result, "Agendamento não encontrado.") };
      }

      const result = await supabase
        .from("service_orders")
        .select("id,order_number,device_brand,device_model,quote_amount,status,customer_id,paid_sale_id,customers(name,phone)")
        .eq("company_id", companyId)
        .eq("id", sourceId)
        .single();
      return { type: "service_order" as const, data: unwrap(result, "Ordem de serviço não encontrada.") };
    },

    async getReceipt(companyId: string, saleId: string) {
      const saleResult = await supabase
        .from("sales")
        .select("id,sale_number,sold_at,subtotal,discount,total,amount_paid,payment_status,status,customers(name)")
        .eq("company_id", companyId)
        .eq("id", saleId)
        .eq("source", "pos")
        .single();
      const sale = unwrap(saleResult, "Venda não encontrada.");

      const [itemsResult, paymentsResult] = await Promise.all([
        supabase.from("sale_items").select("id,product_name,quantity,unit_price,line_total").eq("sale_id", saleId).order("id"),
        supabase.from("sale_payments").select("id,payment_method,amount,status").eq("sale_id", saleId).order("created_at"),
      ]);
      if (itemsResult.error) throw new Error(itemsResult.error.message);
      if (paymentsResult.error) throw new Error(paymentsResult.error.message);
      return { sale, items: itemsResult.data ?? [], payments: paymentsResult.data ?? [] };
    },

    async openSession(openingAmount: number, notes: string | null) {
      const result = await supabase.rpc("open_cash_session", { p_opening_amount: openingAmount, p_notes: notes });
      return unwrap(result, "Não foi possível abrir o caixa.");
    },

    async closeSession(sessionId: string, closingAmount: number, notes: string | null) {
      const result = await supabase.rpc("close_cash_session", {
        p_cash_session_id: sessionId,
        p_closing_amount: closingAmount,
        p_notes: notes,
      });
      return unwrap(result, "Não foi possível fechar o caixa.");
    },

    async addMovement(sessionId: string, movementType: "supply" | "withdrawal", amount: number, description: string) {
      const result = await supabase.rpc("add_cash_movement", {
        p_cash_session_id: sessionId,
        p_movement_type: movementType,
        p_amount: amount,
        p_description: description,
      });
      return unwrap(result, "Não foi possível registrar o movimento.");
    },

    async createSale(input: {
      sessionId: string;
      customerId: string | null;
      discount: number;
      dueDate: string | null;
      items: Array<{
        source_type: string;
        source_id: string | null;
        quantity: number;
        service_name?: string;
        service_description?: string | null;
        unit_price?: number;
        unit_cost?: number;
      }>;
      payments: Array<{ payment_method: string; amount: number }>;
    }) {
      const result = await supabase.rpc("create_pos_sale", {
        p_cash_session_id: input.sessionId,
        p_customer_id: input.customerId,
        p_discount: input.discount,
        p_due_date: input.dueDate,
        p_items: input.items,
        p_payments: input.payments,
      });
      return unwrap(result, "Não foi possível concluir a venda.");
    },

    async cancelSale(saleId: string, reason: string, refundSessionId: string | null) {
      const { error } = await supabase.rpc("cancel_pos_sale", {
        p_sale_id: saleId,
        p_reason: reason,
        p_refund_session_id: refundSessionId,
      });
      if (error) throw new Error(error.message);
    },
  };
}
