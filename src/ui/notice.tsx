import type * as React from 'react'

/**
 * Inline status panel. `tone="info"` uses the muted background (success / confirmation);
 * `tone="error"` uses the destructive tint (validation failure, server error).
 * Closed: no className prop — tone picks all appearance.
 */
export function Notice({ tone, children }: { tone: 'info' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'error'
      ? 'rounded-md bg-destructive/10 p-3 text-destructive text-sm'
      : 'rounded-md bg-muted p-3 text-foreground text-sm'
  return <p className={cls}>{children}</p>
}
