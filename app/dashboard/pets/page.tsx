import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SafeActionForm } from "@/components/safe-action-form";
import { AppointmentEditPanel } from "@/components/Pets/AppointmentEditPanel/appointmentEditPanel";
import { PetEditPanel } from "@/components/Pets/PetEditPanel/petEditPanel";
import { PetStatusFilter } from "@/components/Pets/PetStatusFilter/petStatusFilter";
import { requireStoreUser } from "@/lib/auth";
import { getCompanyBrand } from "@/lib/company-brand";
import { brl, dateBR } from "@/lib/format";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";
import { createPet, createPetAppointment, updatePetAppointmentStatus } from "@/lib/specialized-actions";

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_service: "Em atendimento",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function dateTimeBR(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

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

type PetFilter = "ativos" | "arquivados" | "todos";

export default async function PetsPage({
  searchParams,
}: {
  searchParams: Promise<{ pets?: string }>;
}) {
  const params = await searchParams;
  const petFilter: PetFilter =
    params.pets === "arquivados" ? "arquivados" : params.pets === "todos" ? "todos" : "ativos";

  const auth = await requireStoreUser();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name,slug").eq("id", auth.companyId!).single();
  if (getCompanyBrand(company?.slug, company?.name).key !== "housepet") redirect("/dashboard");

  const todayKey = saoPauloDateKey();

  const [{ data: customers }, { data: pets }, { data: appointments }] = await Promise.all([
    supabase.from("customers").select("id,name,phone").eq("is_active", true).order("name"),
    supabase.from("pets").select("id,name,species,breed,sex,birth_date,weight,neutered,allergies,behavior_notes,medications,photo_url,notes,is_active,customers(id,name,phone)").order("name"),
    supabase.from("pet_appointments").select("id,pet_id,service_type,scheduled_at,status,price,responsible,service_notes,pets(name,species),customers(name,phone)").order("scheduled_at", { ascending: true }).limit(200),
  ]);

  const activePets = pets?.filter((pet) => pet.is_active) ?? [];
  const archivedPets = pets?.filter((pet) => !pet.is_active) ?? [];
  const visiblePets = petFilter === "arquivados" ? archivedPets : petFilter === "todos" ? (pets ?? []) : activePets;
  const appointmentPets = (pets ?? []).map((pet) => ({
    id: pet.id,
    name: pet.name,
    tutorName: relationOne(pet.customers)?.name,
    isActive: pet.is_active,
  }));

  const today = (appointments ?? []).filter((a) => saoPauloDateKey(new Date(a.scheduled_at)) === todayKey && a.status !== "cancelled");
  const active = (appointments ?? []).filter((a) => !["delivered","cancelled"].includes(a.status));

  return <>
    <PageHeader eyebrow="HOUSE PET" title="Pets e agenda" description="Cadastro dos animais, histórico de cuidados e agenda de banho, tosa e atendimentos." />

    <div className="stat-grid">
      <div className="stat-card"><span>Pets ativos</span><strong>{activePets.length}</strong><small>Animais cadastrados</small></div>
      <div className="stat-card success"><span>Agenda de hoje</span><strong>{today.length}</strong><small>Atendimentos do dia</small></div>
      <div className="stat-card warning"><span>Em andamento</span><strong>{active.length}</strong><small>Agendados até entrega</small></div>
      <div className="stat-card"><span>Valor agendado</span><strong>{brl(today.reduce((a,r) => a + Number(r.price ?? 0), 0))}</strong><small>Hoje</small></div>
    </div>

    <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Cadastrar pet</h2></div><div className="panel-body">
        <SafeActionForm action={createPet} className="form-grid" successMessage="Pet cadastrado com sucesso.">
          <label className="wide">Tutor / cliente<select name="customer_id" required><option value="">Selecione...</option>{customers?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}</select></label>
          <label>Nome<input name="name" required /></label>
          <label>Espécie<select name="species" required><option value="Cão">Cão</option><option value="Gato">Gato</option><option value="Outro">Outro</option></select></label>
          <label>Raça<input name="breed" /></label>
          <label>Sexo<select name="sex"><option value="">Não informado</option><option value="Macho">Macho</option><option value="Fêmea">Fêmea</option></select></label>
          <label>Nascimento<input name="birth_date" type="date" /></label>
          <label>Peso (kg)<input name="weight" type="number" min="0" step="0.01" /></label>
          <label className="check-label"><input name="neutered" type="checkbox" /> Castrado</label>
          <label>Foto (URL)<input name="photo_url" type="url" placeholder="Opcional" /></label>
          <label className="wide">Alergias<textarea name="allergies" /></label>
          <label className="wide">Comportamento<textarea name="behavior_notes" placeholder="Medos, reatividade, preferências..." /></label>
          <label className="wide">Medicamentos<textarea name="medications" /></label>
          <label className="wide">Observações<textarea name="notes" /></label>
          <div className="form-actions"><button className="primary">Cadastrar pet</button></div>
        </SafeActionForm>
      </div></section>

      <section className="panel"><div className="panel-head"><h2>Novo agendamento</h2></div><div className="panel-body">
        <SafeActionForm action={createPetAppointment} className="form-grid" successMessage="Serviço agendado com sucesso.">
          <label className="wide">Pet<select name="pet_id" required><option value="">Selecione...</option>{activePets.map((p) => <option key={p.id} value={p.id}>{p.name} — {relationOne(p.customers)?.name ?? "Sem tutor"}</option>)}</select></label>
          <label>Serviço<select name="service_type" required><option>Banho</option><option>Banho + tosa</option><option>Tosa</option><option>Higiene</option><option>Outro</option></select></label>
          <label>Data e hora<input name="scheduled_at" type="datetime-local" required /></label>
          <label>Valor (R$)<input name="price" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Responsável<input name="responsible" /></label>
          <label className="wide">Observações do atendimento<textarea name="service_notes" /></label>
          <div className="form-actions"><button className="primary">Agendar</button></div>
        </SafeActionForm>
      </div></section>
    </div>

    <section className="panel section-gap"><div className="panel-head"><h2>Agenda</h2><span className="badge">{appointments?.length ?? 0}</span></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Pet</th><th>Tutor</th><th>Serviço</th><th>Responsável</th><th>Valor</th><th>Status</th><th>Atualizar</th></tr></thead><tbody>
      {appointments?.map((a) => <tr key={a.id} className={a.status === "ready" ? "highlight-row" : ""}><td><strong>{dateTimeBR(a.scheduled_at)}</strong></td><td>{relationOne(a.pets)?.name ?? "—"}</td><td>{relationOne(a.customers)?.name ?? "—"}</td><td>{a.service_type}</td><td>{a.responsible ?? "—"}</td><td className="amount">{brl(a.price)}</td><td><span className={`badge ${a.status === "delivered" ? "success" : a.status === "cancelled" ? "danger" : "warning"}`}>{statusLabel[a.status] ?? a.status}</span></td><td><div className="appointment-actions"><AppointmentEditPanel appointment={{ id: a.id, petId: a.pet_id, serviceType: a.service_type, scheduledAt: a.scheduled_at, status: a.status, price: a.price, responsible: a.responsible, serviceNotes: a.service_notes }} pets={appointmentPets} /><form action={updatePetAppointmentStatus} className="inline-form"><input type="hidden" name="id" value={a.id}/><select name="status" defaultValue={a.status}>{Object.entries(statusLabel).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button className="secondary">Salvar status</button></form></div></td></tr>)}
      {!appointments?.length ? <tr><td colSpan={8} className="empty">Nenhum agendamento cadastrado.</td></tr> : null}
    </tbody></table></div></section>

    <section className="panel section-gap">
      <div className="panel-head"><h2>Pets cadastrados</h2><PetStatusFilter currentFilter={petFilter} activeCount={activePets.length} archivedCount={archivedPets.length} totalCount={pets?.length ?? 0} /></div>
      <div className="pet-grid panel-body">
        {visiblePets.map((p) => {
          const tutor = relationOne(p.customers);
          return (
            <article className={`pet-card ${!p.is_active ? "archived" : ""}`} key={p.id}>
              {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <div className="pet-avatar">{p.name.slice(0,1).toUpperCase()}</div>}
              <div>
                <span className="eyebrow">{p.species}</span>
                <h3>{p.name}{!p.is_active ? <span className="badge warning">Arquivado</span> : null}</h3>
                <p>{p.breed ?? "Sem raça informada"} • {p.weight ? `${p.weight} kg` : "peso não informado"}</p>
                <p><strong>Tutor:</strong> {tutor?.name ?? "—"}</p>
                {p.allergies ? <p className="pet-warning"><strong>Alergias:</strong> {p.allergies}</p> : null}
                {p.behavior_notes ? <p><strong>Comportamento:</strong> {p.behavior_notes}</p> : null}
                {p.medications ? <p><strong>Medicamentos:</strong> {p.medications}</p> : null}
                {p.birth_date ? <small>Nascimento: {dateBR(p.birth_date)}</small> : null}
              </div>

              <PetEditPanel
                pet={{
                  id: p.id,
                  customerId: tutor?.id ?? "",
                  name: p.name,
                  species: p.species,
                  breed: p.breed,
                  sex: p.sex,
                  birthDate: p.birth_date,
                  weight: p.weight,
                  neutered: p.neutered,
                  allergies: p.allergies,
                  behaviorNotes: p.behavior_notes,
                  medications: p.medications,
                  photoUrl: p.photo_url,
                  notes: p.notes,
                  isActive: p.is_active,
                }}
                customers={(customers ?? []).map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone }))}
              />
            </article>
          );
        })}
        {!visiblePets.length ? <p className="empty">Nenhum pet encontrado para este filtro.</p> : null}
      </div>
    </section>
  </>;
}
