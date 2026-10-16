import { Link } from '@tanstack/react-router'
import { FilePen } from 'lucide-react'
import { type BadgeVariant, PUBLISHED_HEADLINE } from '@/review/dashboard-card-parts'
import type { MyModRow } from '@/review/my-submissions'
import { AnalyticsPrivate } from '@/ui/analytics-private'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Row, Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { SectionCard } from '@/ui/section-card'
import { StretchedLink } from '@/ui/stretched-link'
import { Text, TextLink } from '@/ui/text'

type View = { variant: BadgeVariant; label: string; text: string }

/** Where the submitter's mod stands: a published mod by its newest update, a draft by its review. */
function view({ mod, latest }: MyModRow): View {
  if (mod.status === 'removed') {
    return { variant: 'outline', label: 'removed', text: 'Taken down from the gallery' }
  }
  if (mod.status === 'published') {
    return {
      variant: 'primaryOutline',
      label: 'published',
      text: PUBLISHED_HEADLINE,
    }
  }
  if (latest.status === 'rejected') {
    return { variant: 'destructive', label: 'rejected', text: 'Not accepted' }
  }
  return { variant: 'secondary', label: 'in review', text: 'Waiting for a reviewer' }
}

/** One of the signed-in user's submitted mods on /me. Previews show on its page once published. */
export function MyModCard({ row }: { row: MyModRow }) {
  const { mod, latest } = row
  const v = view(row)
  const published = mod.status === 'published'
  const update = published && latest.versionNumber !== row.liveVersionNumber ? latest : null
  const title = published ? (
    <StretchedLink to="/mods/$slug" params={{ slug: mod.slug }}>
      {mod.title}
    </StretchedLink>
  ) : (
    mod.title
  )
  return (
    <SectionCard interactive={published} title={title}>
      <Stack gap={3}>
        <Row gap={2} align="center" wrap>
          <Badge variant="outline">Mod</Badge>
          <Badge variant={v.variant}>{v.label}</Badge>
          <Text muted size="sm">
            {v.text}
          </Text>
        </Row>
        {update?.status === 'pending' ? (
          <Text muted size="sm">{`Update v${update.versionNumber} in review`}</Text>
        ) : null}
        {latest.status === 'rejected' && latest.rejectionReason ? (
          <AnalyticsPrivate>
            <Stack gap={1}>
              <Text size="sm">{published ? 'Update not accepted' : 'Reviewer reason'}</Text>
              <Notice tone="error">{latest.rejectionReason}</Notice>
            </Stack>
          </AnalyticsPrivate>
        ) : null}
        {published ? (
          // The outer row shrink-wraps the lifted one, so only the button covers the card link.
          <Row gap={2}>
            <Row gap={2} aboveOverlay>
              <Button asChild>
                <Link to="/submit" search={{ kind: 'mod', update: mod.slug }}>
                  <FilePen />
                  {latest.status === 'rejected' ? 'Submit a new update' : 'Submit update'}
                </Link>
              </Button>
            </Row>
          </Row>
        ) : null}
        {mod.status === 'draft' && latest.status === 'rejected' ? (
          <TextLink to="/submit" search={{ kind: 'mod', resubmit: mod.slug }}>
            Fix and resubmit
          </TextLink>
        ) : null}
      </Stack>
    </SectionCard>
  )
}
