import { addDays, parseIsoDate, toIsoDate } from '~/lib/dateShift'

// "Today" is whatever the server told us, passed as a prop — never `new Date()` in the browser (#23).
export function DateNav({
  date,
  today,
  onChange,
}: {
  date: string
  today: string
  onChange: (date: string) => void
}) {
  const shift = (days: number) => onChange(toIsoDate(addDays(parseIsoDate(date), days)))
  return (
    <div className="datenav">
      <button type="button" onClick={() => shift(-1)} aria-label="Previous day">
        ‹
      </button>
      <button type="button" onClick={() => onChange(today)} disabled={date === today}>
        Today
      </button>
      <button type="button" onClick={() => shift(1)} aria-label="Next day">
        ›
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Jump to date"
      />
    </div>
  )
}
