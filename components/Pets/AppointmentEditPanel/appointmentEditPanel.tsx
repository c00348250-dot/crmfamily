import { updatePetAppointment } from "@/lib/specialized-actions";
import styles from "./appointmentEditPanel.module.css";

type PetOption = {
  id: string;
  name: string;
  tutorName?: string | null;
  isActive: boolean;
};

type AppointmentData = {
  id: string;
  petId: string;
  serviceType: string;
  scheduledAt: string;
  status: string;
  price?: number | string | null;
  responsible?: string | null;
  serviceNotes?: string | null;
};

const serviceTypes = ["Banho", "Banho + tosa", "Tosa", "Higiene", "Outro"];
const blockedStatuses = ["delivered", "cancelled"];
const petLockedStatuses = ["in_service", "ready"];

function dateTimeLocal(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function AppointmentEditPanel({ appointment, pets }: { appointment: AppointmentData; pets: PetOption[] }) {
  if (blockedStatuses.includes(appointment.status)) return null;

  const currentPet = pets.find((pet) => pet.id === appointment.petId);
  const locksPet = petLockedStatuses.includes(appointment.status);
  const petOptions = locksPet ? pets.filter((pet) => pet.id === appointment.petId) : pets.filter((pet) => pet.isActive || pet.id === appointment.petId);
  const serviceOptions = serviceTypes.includes(appointment.serviceType) ? serviceTypes : [appointment.serviceType, ...serviceTypes];

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Editar</summary>

      <form action={updatePetAppointment} className={styles.form}>
        <input type="hidden" name="id" value={appointment.id} />

        <label className={styles.wide}>
          Pet
          <select name="pet_id" required defaultValue={appointment.petId} disabled={locksPet}>
            {!currentPet ? <option value={appointment.petId}>Pet atual</option> : null}
            {petOptions.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}{pet.tutorName ? ` — ${pet.tutorName}` : ""}{!pet.isActive ? " (arquivado)" : ""}
              </option>
            ))}
          </select>
          {locksPet ? <input type="hidden" name="pet_id" value={appointment.petId} /> : null}
        </label>

        <label>
          Serviço
          <select name="service_type" required defaultValue={appointment.serviceType}>
            {serviceOptions.map((serviceType) => <option key={serviceType}>{serviceType}</option>)}
          </select>
        </label>

        <label>
          Data e hora
          <input name="scheduled_at" type="datetime-local" required defaultValue={dateTimeLocal(appointment.scheduledAt)} />
        </label>

        <label>
          Valor (R$)
          <input name="price" type="number" min="0" step="0.01" defaultValue={appointment.price ?? 0} />
        </label>

        <label>
          Responsável
          <input name="responsible" defaultValue={appointment.responsible ?? ""} />
        </label>

        <label className={styles.wide}>
          Observações do atendimento
          <textarea name="service_notes" defaultValue={appointment.serviceNotes ?? ""} />
        </label>

        <div className={styles.actions}>
          <span>Salva no mesmo agendamento, preservando status e histórico.</span>
          <div>
            <button className="primary" type="submit">Salvar alterações</button>
            <button className="secondary" type="reset">Cancelar</button>
          </div>
        </div>
      </form>
    </details>
  );
}
