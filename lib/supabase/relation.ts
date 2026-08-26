type RelationItem<T> = T extends readonly (infer U)[] ? U : Exclude<T, null | undefined>;

export function relationOne<T>(value: T): RelationItem<T> | null {
  if (Array.isArray(value)) return (value[0] ?? null) as RelationItem<T> | null;
  return (value ?? null) as RelationItem<T> | null;
}
