import { Button } from '~/components/ui/button'
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
      <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous day">
        ‹
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onChange(today)} disabled={date === today}>
        Today
      </Button>
      <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next day">
        ›
      </Button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Jump to date"
      />
    </div>
  )
}
