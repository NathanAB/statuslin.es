import { kindCount } from '@/gallery/kind-count'

function utcDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

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
