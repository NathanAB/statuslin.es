import type { ReactNode } from 'react'

/**
 * Two things read together, side by side from 1024px (the guide's payload and its field list): the
 * first, the wider, takes three fifths, so a code well's lines fit; the second takes the rest.
 * Stacked below 1024px, the first on top. Each side's text fills its part.
 */
export function SideBySide({ first, second }: { first: ReactNode; second: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">{first}</div>
      <div className="min-w-0">{second}</div>
    </div>
  )
}
