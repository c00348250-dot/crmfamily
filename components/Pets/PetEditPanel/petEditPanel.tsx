import { archivePet, reactivatePet, updatePet } from "@/lib/pet-actions";
import styles from "./petEditPanel.module.css";

type CustomerOption = {
  id: string;
  name: string;
  phone?: string | null;
};

type PetData = {
  id: string;
  customerId: string;
  name: string;
  species: string;
  breed?: string | null;
  sex?: string | null;
  birthDate?: string | null;
  weight?: number | string | null;
  neutered: boolean;
  allergies?: string | null;
  behaviorNotes?: string | null;
  medications?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export function PetEditPanel({ pet, customers }: { pet: PetData; customers: CustomerOption[] }) {
  if (!pet.isActive) {
    return (
      <div className={styles.reactivateBox}>
        <div>
          <strong>Pet arquivado</strong>
          <p>O pet está fora das operações ativas. Reative para voltar a editar e agendar novos atendimentos.</p>
        </div>
        <form action={reactivatePet} className={styles.archiveForm}>
          <input type="hidden" name="id" value={pet.id} />
          <button className="secondary" type="submit">Reativar pet</button>
        </form>
      </div>
    );
  }

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Editar pet</summary>

      <div className={styles.content}>
        <form action={updatePet} className={styles.form}>
          <input type="hidden" name="id" value={pet.id} />

          <label className={styles.wide}>
            Tutor / cliente
            <select name="customer_id" required defaultValue={pet.customerId}>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}{customer.phone ? ` — ${customer.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nome
            <input name="name" required defaultValue={pet.name} />
          </label>

          <label>
            Espécie
            <select name="species" required defaultValue={pet.species}>
              <option value="Cão">Cão</option>
              <option value="Gato">Gato</option>
              <option value="Outro">Outro</option>
            </select>
          </label>

          <label>
            Raça
            <input name="breed" defaultValue={pet.breed ?? ""} />
          </label>

          <label>
            Sexo
            <select name="sex" defaultValue={pet.sex ?? ""}>
              <option value="">Não informado</option>
              <option value="Macho">Macho</option>
              <option value="Fêmea">Fêmea</option>
            </select>
          </label>

          <label>
            Nascimento
            <input name="birth_date" type="date" defaultValue={pet.birthDate ?? ""} />
          </label>

          <label>
            Peso (kg)
            <input name="weight" type="number" min="0" step="0.01" defaultValue={pet.weight ?? ""} />
          </label>

          <label className={styles.checkLabel}>
            <input name="neutered" type="checkbox" defaultChecked={pet.neutered} />
            Castrado
          </label>

          <label>
            Foto (URL)
            <input name="photo_url" type="url" defaultValue={pet.photoUrl ?? ""} placeholder="Opcional" />
          </label>

          <label className={styles.wide}>
            Alergias
            <textarea name="allergies" defaultValue={pet.allergies ?? ""} />
          </label>

          <label className={styles.wide}>
            Comportamento
            <textarea name="behavior_notes" defaultValue={pet.behaviorNotes ?? ""} />
          </label>

          <label className={styles.wide}>
            Medicamentos
            <textarea name="medications" defaultValue={pet.medications ?? ""} />
          </label>

          <label className={styles.wide}>
            Observações
            <textarea name="notes" defaultValue={pet.notes ?? ""} />
          </label>

          <div className={styles.actions}>
            <span>As alterações atualizam o cadastro atual do pet sem apagar o histórico de atendimentos.</span>
            <button className="primary" type="submit">Salvar alterações</button>
          </div>
        </form>

        <div className={styles.archiveBox}>
          <div>
            <strong>Arquivar pet</strong>
            <p>Remove o pet das operações ativas, mas preserva os atendimentos já registrados.</p>
          </div>
          <form action={archivePet} className={styles.archiveForm}>
            <input type="hidden" name="id" value={pet.id} />
            <label>
              <input type="checkbox" required /> Confirmo o arquivamento
            </label>
            <button className="danger" type="submit">Arquivar pet</button>
          </form>
        </div>
      </div>
    </details>
  );
}
