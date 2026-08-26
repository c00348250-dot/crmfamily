import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireStoreUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { brl, dateBR } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";
import { createDeviceUnit, createServiceOrder, updateServiceOrderStatus } from "@/lib/specialized-actions";

const statusLabel: Record<string, string> = {
  received: "Recebido",
  analysis: "Em análise",
  awaiting_approval: "Aguardando aprovação",
  awaiting_part: "Aguardando peça",
  repair: "Em manutenção",
  ready: "Pronto para retirada",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function warrantyEnd(deliveredAt: string | null, days: number | string) {
  if (!deliveredAt) return null;
  const date = new Date(deliveredAt);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString();
}

export default async function AssistancePage() {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name,slug").eq("id", auth.companyId!).single();
  if (getCompanyBrand(company?.slug, company?.name).key !== "schemmer") redirect("/dashboard");

  const [{ data: customers }, { data: products }, { data: orders }, { data: units }] = await Promise.all([
    supabase.from("customers").select("id,name,phone").eq("is_active", true).order("name"),
    supabase.from("products").select("id,name").eq("is_active", true).order("name"),
    supabase.from("service_orders").select("id,order_number,device_brand,device_model,imei,issue_reported,technician,quote_amount,warranty_days,estimated_delivery,status,delivered_at,created_at,customers(name,phone)").order("created_at", { ascending: false }).limit(100),
    supabase.from("device_units").select("id,brand,model,imei,serial_number,color,purchase_cost,sale_price,warranty_days,status,created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const activeOrders = (orders ?? []).filter((o) => !["delivered", "cancelled"].includes(o.status));
  const ready = activeOrders.filter((o) => o.status === "ready").length;

  return <>
    <PageHeader eyebrow="SCHEMMER CELL" title="Assistência técnica" description="Ordens de serviço, IMEI, garantia e acompanhamento completo dos aparelhos." />

    <div className="stat-grid">
      <div className="stat-card"><span>OS abertas</span><strong>{activeOrders.length}</strong><small>Em atendimento</small></div>
      <div className="stat-card success"><span>Prontos</span><strong>{ready}</strong><small>Aguardando retirada</small></div>
      <div className="stat-card"><span>Aparelhos controlados</span><strong>{units?.length ?? 0}</strong><small>IMEI / número de série</small></div>
      <div className="stat-card"><span>Valor em OS abertas</span><strong>{brl(activeOrders.reduce((a, o) => a + Number(o.quote_amount ?? 0), 0))}</strong><small>Orçamentos ativos</small></div>
    </div>

    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Nova ordem de serviço</h2></div><div className="panel-body">
        <form action={createServiceOrder} className="form-grid">
          <label className="wide">Cliente<select name="customer_id"><option value="">Não identificado</option>{customers?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}</select></label>
          <label>Marca<input name="device_brand" required placeholder="Samsung, Apple..." /></label>
          <label>Modelo<input name="device_model" required placeholder="Galaxy A54, iPhone 13..." /></label>
          <label>IMEI<input name="imei" /></label>
          <label>Nº de série<input name="serial_number" /></label>
          <label>Cor<input name="color" /></label>
          <label>Técnico responsável<input name="technician" /></label>
          <label className="wide">Defeito informado<textarea name="issue_reported" required /></label>
          <label className="wide">Estado físico do aparelho<textarea name="condition_notes" placeholder="Riscos, trincas, marcas já existentes..." /></label>
          <label className="wide">Acessórios entregues<textarea name="accessories" placeholder="Capa, carregador, chip..." /></label>
          <label>Orçamento (R$)<input name="quote_amount" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Custo de peças (R$)<input name="parts_cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Mão de obra (R$)<input name="labor_amount" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Garantia (dias)<input name="warranty_days" type="number" min="0" defaultValue="90" /></label>
          <label>Previsão de entrega<input name="estimated_delivery" type="date" /></label>
          <label className="wide">Observações<textarea name="notes" /></label>
          <div className="form-actions"><button className="primary">Abrir ordem de serviço</button></div>
        </form>
        <p className="callout section-gap">Por segurança, o CRM não armazena senha de desbloqueio do aparelho em texto aberto. A garantia começa a contar quando a OS é marcada como entregue.</p>
      </div></section>

      <section className="panel"><div className="panel-head"><h2>Controle de aparelhos / IMEI</h2></div><div className="panel-body">
        <form action={createDeviceUnit} className="form-grid">
          <label className="wide">Produto relacionado<select name="product_id"><option value="">Sem vínculo</option>{products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Marca<input name="brand" required /></label>
          <label>Modelo<input name="model" required /></label>
          <label>IMEI<input name="imei" /></label>
          <label>Nº de série<input name="serial_number" /></label>
          <label>Cor<input name="color" /></label>
          <label>Garantia (dias)<input name="warranty_days" type="number" min="0" defaultValue="90" /></label>
          <label>Custo (R$)<input name="purchase_cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Venda (R$)<input name="sale_price" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <div className="form-actions"><button className="secondary">Cadastrar aparelho</button></div>
        </form>
      </div></section>
    </div>

    <section className="panel section-gap"><div className="panel-head"><h2>Ordens de serviço</h2><span className="badge">{orders?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>OS</th><th>Entrada</th><th>Cliente</th><th>Aparelho</th><th>IMEI</th><th>Defeito</th><th>Orçamento</th><th>Garantia</th><th>Status</th><th>Atualizar</th></tr></thead><tbody>
      {orders?.map((o) => { const warranty = warrantyEnd(o.delivered_at, o.warranty_days); return <tr key={o.id} className={o.status === "ready" ? "highlight-row" : ""}>
        <td><strong>#{o.order_number}</strong></td><td>{dateBR(o.created_at)}</td><td>{relationOne(o.customers)?.name ?? "—"}</td><td>{o.device_brand} {o.device_model}</td><td>{o.imei ?? "—"}</td><td>{o.issue_reported}</td><td className="amount">{brl(o.quote_amount)}</td><td>{o.status === "delivered" && warranty ? <span className="badge success">até {dateBR(warranty)}</span> : `${o.warranty_days} dias`}</td><td><span className={`badge ${o.status === "ready" || o.status === "delivered" ? "success" : o.status === "cancelled" ? "danger" : "warning"}`}>{statusLabel[o.status] ?? o.status}</span></td>
        <td><form action={updateServiceOrderStatus} className="inline-form"><input type="hidden" name="id" value={o.id}/><select name="status" defaultValue={o.status}>{Object.entries(statusLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button className="secondary">Salvar</button></form></td>
      </tr>; })}
      {!orders?.length ? <tr><td colSpan={10} className="empty">Nenhuma ordem de serviço cadastrada.</td></tr> : null}
    </tbody></table></div></section>

    <section className="panel section-gap"><div className="panel-head"><h2>Aparelhos por unidade</h2><span className="badge">{units?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>Aparelho</th><th>IMEI</th><th>Série</th><th>Cor</th><th>Custo</th><th>Venda</th><th>Garantia</th><th>Status</th></tr></thead><tbody>
      {units?.map((u) => <tr key={u.id}><td><strong>{u.brand} {u.model}</strong></td><td>{u.imei ?? "—"}</td><td>{u.serial_number ?? "—"}</td><td>{u.color ?? "—"}</td><td>{brl(u.purchase_cost)}</td><td className="amount">{brl(u.sale_price)}</td><td>{u.warranty_days} dias</td><td><span className="badge success">{u.status === "in_stock" ? "Em estoque" : u.status}</span></td></tr>)}
      {!units?.length ? <tr><td colSpan={8} className="empty">Nenhum aparelho controlado por IMEI.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
