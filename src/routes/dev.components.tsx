import { createFileRoute } from '@tanstack/react-router'
import { DayMathChip } from '~/components/dayMathChip'
import { DateNav } from '~/components/dateNav'

// Dev-only fixture viewer: every UI primitive added in 4.4 renders here with
// hard-coded props, so the reviewer can eye the visuals against the prototype
// without running the full /today route.
export const Route = createFileRoute('/dev/components')({
  component: DevComponents,
})

function DevComponents() {
  return (
    <main style={{ padding: 40, display: 'grid', gap: 24, maxWidth: 720 }}>
      <section>
        <h2 style={{ marginBottom: 8 }}>DayMathChip</h2>
        <DayMathChip trio={{ wallClockMin: 510, effortMin: 600, premiumMin: 90 }} />
        <div style={{ height: 8 }} />
        <DayMathChip trio={{ wallClockMin: 90, effortMin: 120, premiumMin: 30 }} />
        <div style={{ height: 8 }} />
        <DayMathChip trio={{ wallClockMin: 60, effortMin: 60, premiumMin: 0 }} />
      </section>
      <section>
        <h2 style={{ marginBottom: 8 }}>DateNav</h2>
        <DateNav date="2026-09-02" today="2026-09-04" onChange={() => {}} />
        <div style={{ height: 8 }} />
        <DateNav date="2026-09-04" today="2026-09-04" onChange={() => {}} />
      </section>
    </main>
  )
}
