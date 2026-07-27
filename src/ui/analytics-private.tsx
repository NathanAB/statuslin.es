import type { ReactNode } from 'react'

/** Prevent PostHog autocapture from collecting sensitive descendant text or form values. */
export function AnalyticsPrivate({ children }: { children: ReactNode }) {
  return <div className="ph-no-capture">{children}</div>
}
