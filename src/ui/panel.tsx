import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * A borderless surface straight on the page, the gallery rows' tone: the guide's fast paths and the
 * submit page's side panel. `size="band"` is a whole section's field, with room around it (the
 * /resources marketplaces). Never put one inside another.
 */
export function Panel({
  size = 'default',
  children,
}: {
  size?: 'default' | 'band'
  children: ReactNode
}) {
  return (
    <div
      data-slot="panel"
      className={cn(
        'flex flex-col bg-card',
        size === 'default' && 'gap-2 rounded-panel px-5 pt-4.5 pb-5',
        size === 'band' && 'gap-8 rounded-frame p-[clamp(1.25rem,3.5vw,3rem)]',
      )}
    >
      {children}
    </div>
  )
}
