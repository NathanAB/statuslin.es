import { kindCount } from '@/gallery/kind-count'
import { utcDateLabel } from '@/lib/date-label'

/** The home page's inventory, a line in its footer: both kinds, their installs, and as of when. */
export function HomeIndexNote({
  statusLines,
  mods,
  copyCount,
  asOf,
}: {
  statusLines: number
  mods: number
  copyCount: number
  asOf: string
}) {
  return (
    <>
      {kindCount(statusLines, mods)}, installed {copyCount.toLocaleString('en-US')} times as of{' '}
      <time dateTime={asOf}>{utcDateLabel(asOf)}</time>.
    </>
  )
}
