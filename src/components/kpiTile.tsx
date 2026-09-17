export function KpiTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="kpi">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}
