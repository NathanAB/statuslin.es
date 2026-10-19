import { kindCount } from '@/gallery/kind-count'
import { Text } from '@/ui/text'

function utcDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

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
    <Text muted size="xs" center>
      {kindCount(statusLines, mods)}, copied {copyCount.toLocaleString('en-US')} times as of{' '}
      <time dateTime={asOf}>{utcDateLabel(asOf)}</time>.
    </Text>
  )
}
