import { usePostHog } from '@posthog/react'
import {
  type ListingKind,
  listingBadgePath,
  listingCardPath,
  listingPath,
  SITE_NAME,
} from '@/lib/site'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { BadgeImage } from '@/ui/badge-image'
import { CodeBlock } from '@/ui/code-block'
import { Stack } from '@/ui/layout'
import { PageSection } from '@/ui/page-section'
import { ShareCardImage } from '@/ui/share-card-image'
import { Text } from '@/ui/text'

// Fixed alt text: the listing's title is the author's, and a `]` in it would break the Markdown.
const BADGE_ALT = `Reviewed on ${SITE_NAME}`
const CARD_ALT = `Preview on ${SITE_NAME}`

type Snippet = 'badge' | 'card'

/**
 * A listing's "Badge for your README": the live badge and the preview card, each with the Markdown
 * that embeds it and links back here. Copying one is an analytics event, never an install.
 */
export function ReadmeBadgeSection({
  kind,
  slug,
  origin,
}: {
  kind: ListingKind
  slug: string
  origin: string
}) {
  const posthog = usePostHog()
  const link = `${origin}${listingPath(kind, slug)}?utm_source=readme-badge`
  const badgeUrl = `${origin}${listingBadgePath(kind, slug)}`
  const badgeMarkdown = `[![${BADGE_ALT}](${badgeUrl})](${link})`
  const cardUrl = `${origin}${listingCardPath(kind, slug)}`
  const cardMarkdown = `[![${CARD_ALT}](${cardUrl})](${link})`
  const copied = (snippet: Snippet) => () =>
    posthog.capture('badge_snippet_copied', { kind, slug, snippet })

  return (
    <PageSection title="Badge for your README">
      <Text muted>
        Own this listing? Add it to your README. The badge shows the install count as it grows.
      </Text>
      <Stack gap={3}>
        <BadgeImage src={badgeUrl} alt={BADGE_ALT} />
        <CodeBlock
          wrap
          text={badgeMarkdown}
          copyLabel="Copy badge Markdown"
          onCopied={copied('badge')}
        >
          {badgeMarkdown}
        </CodeBlock>
        <Text muted size="sm">
          Or show the preview card:
        </Text>
        <ShareCardImage src={cardUrl} alt={CARD_ALT} width={CARD_WIDTH} height={CARD_HEIGHT} />
        <CodeBlock
          wrap
          text={cardMarkdown}
          copyLabel="Copy preview card Markdown"
          onCopied={copied('card')}
        >
          {cardMarkdown}
        </CodeBlock>
      </Stack>
    </PageSection>
  )
}
