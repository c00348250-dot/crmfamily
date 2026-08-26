import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireStoreUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { brl, dateBR } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";

function saoPauloDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function AlertsPage() {
  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name,slug").eq("id", auth.companyId!).single();
  const brand = getCompanyBrand(company?.slug, company?.name);
  const today = saoPauloDateKey();

  const [{ data: products }, { data: receivables }, { data: financial }] = await Promise.all([
    supabase.from("products").select("id,name,sku,stock_qty,min_stock").eq("is_active", true),
    supabase.from("receivables").select("id,amount_total,amount_paid,due_date,status,customers(name)").in("status", ["open","partial"]).order("due_date"),
    supabase.from("financial_transactions").select("id,description,amount,due_date,status,transaction_type").eq("status", "pending").order("due_date"),
  ]);

  const low = (products ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_stock));
  const out = low.filter((p) => Number(p.stock_qty) <= 0);
  const overdueReceivables = (receivables ?? []).filter((r) => r.due_date && r.due_date < today);
  const dueFinancial = (financial ?? []).filter((f) => f.due_date && f.due_date <= today);

  let specialized: React.ReactNode = null;
  let specializedCount = 0;

  if (brand.key === "schemmer") {
    const { data: orders } = await supabase.from("service_orders").select("id,order_number,device_brand,device_model,status,estimated_delivery,customers(name)").in("status", ["awaiting_part","ready","repair","analysis"]).order("created_at");
    const ready = (orders ?? []).filter((o) => o.status === "ready");
    const waitingPart = (orders ?? []).filter((o) => o.status === "awaiting_part");
    specializedCount = ready.length + waitingPart.length;
    specialized = <section className="panel"><div className="panel-head"><h2>Assistência técnica</h2><Link href="/dashboard/assistencia" className="secondary">Abrir assistência</Link></div><div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Aparelho</th><th>Previsão</th><th>Alerta</th></tr></thead><tbody>
      {(orders ?? []).map((o) => <tr key={o.id}><td>#{o.order_number}</td><td>{relationOne(o.customers)?.name ?? "—"}</td><td>{o.device_brand} {o.device_model}</td><td>{o.estimated_delivery ? dateBR(o.estimated_delivery) : "—"}</td><td><span className={`badge ${o.status === "ready" ? "success" : o.status === "awaiting_part" ? "warning" : ""}`}>{o.status === "ready" ? "Pronto para retirada" : o.status === "awaiting_part" ? "Aguardando peça" : "Em atendimento"}</span></td></tr>)}
      {!orders?.length ? <tr><td colSpan={5} className="empty">Nenhum alerta da assistência.</td></tr> : null}
    </tbody></table></div></section>;
  }

  if (brand.key === "housepet") {
    const start = new Date(`${today}T00:00:00-03:00`);
    const end = new Date(`${today}T23:59:59.999-03:00`);
    const { data: appointments } = await supabase.from("pet_appointments").select("id,service_type,scheduled_at,status,pets(name),customers(name,phone)").gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString()).neq("status", "cancelled").order("scheduled_at");
    specializedCount = appointments?.length ?? 0;
    specialized = <section className="panel"><div className="panel-head"><h2>Agenda de hoje</h2><Link href="/dashboard/pets" className="secondary">Abrir agenda</Link></div><div className="table-wrap"><table><thead><tr><th>Hora</th><th>Pet</th><th>Tutor</th><th>Serviço</th><th>Status</th></tr></thead><tbody>
      {appointments?.map((a) => <tr key={a.id}><td>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(a.scheduled_at))}</td><td><strong>{relationOne(a.pets)?.name ?? "—"}</strong></td><td>{relationOne(a.customers)?.name ?? "—"}</td><td>{a.service_type}</td><td><span className={`badge ${a.status === "ready" ? "success" : "warning"}`}>{a.status === "ready" ? "Pronto" : a.status === "confirmed" ? "Confirmado" : a.status === "in_service" ? "Em atendimento" : "Agendado"}</span></td></tr>)}
      {!appointments?.length ? <tr><td colSpan={5} className="empty">Nenhum atendimento marcado para hoje.</td></tr> : null}
    </tbody></table></div></section>;
  }

  if (brand.key === "sedux") {
    const limit = new Date(`${today}T12:00:00-03:00`); limit.setDate(limit.getDate() + 60);
    const [{ data: batches }, { data: variants }] = await Promise.all([
      supabase.from("product_batches").select("id,expires_at,quantity,products(name)").lte("expires_at", limit.toISOString().slice(0,10)).order("expires_at"),
      supabase.from("product_variants").select("id,sku,stock_qty,min_stock,products(name)").eq("is_active", true),
    ]);
    const lowVariants = (variants ?? []).filter((v) => Number(v.stock_qty) <= Number(v.min_stock));
    specializedCount = (batches?.length ?? 0) + lowVariants.length;
    specialized = <section className="panel"><div className="panel-head"><h2>Catálogo Sedux</h2><Link href="/dashboard/catalogo" className="secondary">Abrir catálogo especial</Link></div><div className="panel-body alert-stack">
      {(batches ?? []).map((b) => <div className="alert-line warning" key={`b-${b.id}`}><strong>Validade:</strong><span>{relationOne(b.products)?.name ?? "Produto"} • {dateBR(b.expires_at)} • {b.quantity} un.</span></div>)}
      {lowVariants.map((v) => <div className="alert-line warning" key={`v-${v.id}`}><strong>Variação:</strong><span>{relationOne(v.products)?.name ?? "Produto"} • {v.sku} • estoque {v.stock_qty} / mín. {v.min_stock}</span></div>)}
      {!specializedCount ? <p className="empty">Nenhum alerta de validade ou variações.</p> : null}
    </div></section>;
  }

  const totalAlerts = low.length + overdueReceivables.length + dueFinancial.length + specializedCount;

  return <>
    <PageHeader eyebrow="ATENÇÃO" title="Central de alertas" description="Tudo que exige ação da equipe, reunido em uma única tela." />
    <div className="stat-grid">
      <div className={`stat-card ${totalAlerts ? "warning" : "success"}`}><span>Alertas ativos</span><strong>{totalAlerts}</strong><small>{totalAlerts ? "Exigem atenção" : "Tudo em ordem"}</small></div>
      <div className={`stat-card ${out.length ? "warning" : ""}`}><span>Sem estoque</span><strong>{out.length}</strong><small>{low.length} no mínimo</small></div>
      <div className={`stat-card ${overdueReceivables.length ? "warning" : ""}`}><span>Clientes vencidos</span><strong>{overdueReceivables.length}</strong><small>{brl(overdueReceivables.reduce((a,r) => a + Number(r.amount_total)-Number(r.amount_paid),0))}</small></div>
      <div className={`stat-card ${dueFinancial.length ? "warning" : ""}`}><span>Contas vencendo/vencidas</span><strong>{dueFinancial.length}</strong><small>Financeiro pendente</small></div>
    </div>

    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Estoque</h2><Link href="/dashboard/compras" className="secondary">Ir para compras</Link></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Atual</th><th>Mínimo</th><th>Status</th></tr></thead><tbody>
        {low.map((p) => <tr key={p.id} className="low-stock-row"><td><strong>{p.name}</strong></td><td>{p.sku}</td><td>{p.stock_qty}</td><td>{p.min_stock}</td><td><span className={`badge ${Number(p.stock_qty) <= 0 ? "danger" : "warning"}`}>{Number(p.stock_qty) <= 0 ? "Sem estoque" : "Estoque mínimo"}</span></td></tr>)}
        {!low.length ? <tr><td colSpan={5} className="empty">Estoque em ordem.</td></tr> : null}
      </tbody></table></div></section>

      <section className="panel"><div className="panel-head"><h2>Financeiro e cobranças</h2><Link href="/dashboard/devedores" className="secondary">Ver devedores</Link></div><div className="panel-body alert-stack">
        {overdueReceivables.map((r) => <div className="alert-line danger" key={`r-${r.id}`}><strong>{relationOne(r.customers)?.name ?? "Cliente"}</strong><span>Venceu em {dateBR(r.due_date)} • {brl(Number(r.amount_total)-Number(r.amount_paid))}</span></div>)}
        {dueFinancial.map((f) => <div className="alert-line warning" key={`f-${f.id}`}><strong>{f.description}</strong><span>{f.due_date ? dateBR(f.due_date) : "Sem vencimento"} • {brl(f.amount)}</span></div>)}
        {!overdueReceivables.length && !dueFinancial.length ? <p className="empty">Nenhuma pendência financeira urgente.</p> : null}
      </div></section>
    </div>

    <div className="section-gap">{specialized}</div>
  </>;
}
