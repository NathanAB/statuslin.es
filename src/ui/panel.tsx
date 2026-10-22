import type { ReactNode } from 'react'

/**
 * A borderless surface straight on the page, the gallery rows' tone: the guide's fast paths, the
 * submit page's side panel and the /resources map's tiles. Never put one inside another.
 */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div data-slot="panel" className="flex flex-col gap-2 rounded-panel bg-card px-5 pt-4.5 pb-5">
      {children}
    </div>
  )
}
