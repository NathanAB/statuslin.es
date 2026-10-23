import type { ReactNode } from 'react'

/**
 * A borderless surface straight on the page, the gallery rows' tone: the guide's fast paths, the
 * submit page's side panel and the /resources map's tiles. Never put one inside another. `foot`
 * (a tile's links) sits at the bottom one item per line, so panels sharing a grid row line it up.
 */
export function Panel({ foot, children }: { foot?: ReactNode; children: ReactNode }) {
  return (
    <div data-slot="panel" className="flex flex-col gap-2 rounded-panel bg-card px-5 pt-4.5 pb-5">
      {children}
      {foot ? (
        <div data-slot="panel-foot" className="mt-auto flex flex-col items-start gap-1.5 pt-2">
          {foot}
        </div>
      ) : null}
    </div>
  )
}
