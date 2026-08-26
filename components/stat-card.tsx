export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "warning" | "success" }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</article>;
}
