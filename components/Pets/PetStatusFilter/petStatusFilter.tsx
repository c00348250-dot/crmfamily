import Link from "next/link";
import styles from "./petStatusFilter.module.css";

type PetFilter = "ativos" | "arquivados" | "todos";

type PetStatusFilterProps = {
  currentFilter: PetFilter;
  activeCount: number;
  archivedCount: number;
  totalCount: number;
};

const filters: Array<{ value: PetFilter; label: string; countKey: "activeCount" | "archivedCount" | "totalCount" }> = [
  { value: "ativos", label: "Ativos", countKey: "activeCount" },
  { value: "arquivados", label: "Arquivados", countKey: "archivedCount" },
  { value: "todos", label: "Todos", countKey: "totalCount" },
];

export function PetStatusFilter({ currentFilter, activeCount, archivedCount, totalCount }: PetStatusFilterProps) {
  const counts = { activeCount, archivedCount, totalCount };

  return (
    <nav className={styles.filter} aria-label="Filtrar pets cadastrados">
      {filters.map((filter) => (
        <Link
          key={filter.value}
          href={`/dashboard/pets?pets=${filter.value}`}
          className={`${styles.link} ${currentFilter === filter.value ? styles.active : ""}`}
          aria-current={currentFilter === filter.value ? "page" : undefined}
        >
          <span>{filter.label}</span>
          <strong>{counts[filter.countKey]}</strong>
        </Link>
      ))}
    </nav>
  );
}
