export type SubTab = { id: string; label: string }

export function SubTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SubTab[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="subtabs" role="tablist" aria-label="Report sub-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className="subtab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
