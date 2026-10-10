import { HOME_HEADING } from '@/lib/page-title'
import { Stack } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'

export function HomeGalleryIntro({ page }: { page: number }) {
  return (
    <Stack gap={3}>
      <Heading level={1} size="compact">
        {page > 1 ? `${HOME_HEADING}, page ${page}` : HOME_HEADING}
      </Heading>
      <Text size="sm" measure>
        Status lines are submitted by the community and reviewed by hand. We pick the mods and list
        them on their authors' behalf. Every card shows real output from the script or mod itself.
      </Text>
    </Stack>
  )
}

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
  publishedCount,
  copyCount,
  asOf,
}: {
  publishedCount: number
  copyCount: number
  asOf: string
}) {
  return (
    <Text muted size="xs" center>
      {publishedCount} published status lines, copied {copyCount.toLocaleString('en-US')} times as
      of <time dateTime={asOf}>{utcDateLabel(asOf)}</time>.
    </Text>
  )
}
