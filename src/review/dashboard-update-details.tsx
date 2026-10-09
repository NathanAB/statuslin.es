import type { UpdateSummary } from '@/review/my-submissions'
import { Row, Stack } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'

const UPDATE_RENDER_LINE: Record<string, (versionNumber: number) => string> = {
  queued: (n) => `Update v${n} queued to render`,
  running: (n) => `Update v${n} rendering`,
  failed: (n) => `Update v${n} failed to render`,
}
const inReview = (n: number) => `Update v${n} in review`

function updateLine(update: UpdateSummary | null): string | null {
  if (update?.status !== 'pending') return null
  return (UPDATE_RENDER_LINE[update.renderStatus] ?? inReview)(update.versionNumber)
}

/** On an author's published card: where a pending update stands, and the way to submit one. */
export function UpdateDetails({ slug, update }: { slug: string; update: UpdateSummary | null }) {
  const line = updateLine(update)
  return (
    <Stack gap={2}>
      {line ? (
        <Text muted size="sm">
          {line}
        </Text>
      ) : null}
      <Row gap={2} aboveOverlay>
        <TextLink to="/submit" search={{ update: slug }}>
          Submit update
        </TextLink>
      </Row>
    </Stack>
  )
}
