/* The how-time-is-counted explainer, now a `?` popover in the viewer's own lane head (LD2). */
export function HowCounted() {
  return (
    <details className="howcounted">
      <summary className="iconbtn" data-tip="How time is counted" aria-label="How time is counted">
        ?
      </summary>
      <div className="howcounted-body" role="region" aria-label="How time is counted">
        <h2>How time is counted</h2>
        <p>Three numbers over the same day:</p>
        <ul>
          <li><b>On the clock</b> — time covered. 9:00–17:00 is 8:00, even if three jobs overlapped.</li>
          <li><b>Total of entries</b> — what you'd get by adding every entry, including ones that overlap.</li>
          <li><b>Overlap</b> — the difference. Extra minutes from working two jobs at once.</li>
        </ul>
        <p>Overlap is what gets billed when shared time is counted once per job — the audit disclosure on invoices.</p>
      </div>
    </details>
  )
}
