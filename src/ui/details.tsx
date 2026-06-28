import type * as React from 'react'

/**
 * Closed disclosure widget. Renders a <details>/<summary> pair with the
 * design-system summary styling (cursor-pointer, muted small text).
 * Children appear as the revealed body content.
 */
export function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground text-sm">{summary}</summary>
      {children}
    </details>
  )
}
