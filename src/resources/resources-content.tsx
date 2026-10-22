import type { ComponentProps } from 'react'
import type { ResourcesShowcase } from '@/compare/pages'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { CONTACT_EMAIL } from '@/lib/site'
import { MarketplaceLine } from '@/mods/marketplace-line'
import { CustomizationMap } from '@/resources/customization-map'
import { RESOURCE_SECTIONS, type ResourceSection, resourceAnchor } from '@/resources/data'
import { DirectorySection } from '@/ui/directory-section'
import { HomeSection } from '@/ui/home-section'
import { ColumnGrid, Row, Stack, TileGrid } from '@/ui/layout'
import { LinkCard } from '@/ui/link-card'
import { PageHeader } from '@/ui/page-header'
import { StretchedLink } from '@/ui/stretched-link'
import { SubmitCta } from '@/ui/submit-cta'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

const RESOURCES_HEADING = 'Claude Code customization tools & resources'
// Most of the page's searches are a status line tool's name, so its first sentence names the two
// biggest (Search Console, 2026-07-21 to 2026-10-20).
const RESOURCES_LEAD =
  'Every way to change Claude Code, from status line tools like ccstatusline and claude-powerline to mods and themes.'

/** A section of src/resources/data.ts by key; a missing one is a typo here, so it fails loudly. */
function sectionOf(key: string): ResourceSection {
  const section = RESOURCE_SECTIONS.find((s) => s.key === key)
  if (!section) throw new Error(`No /resources section "${key}"`)
  return section
}
// The small sections, side by side under the status line tools.
const MORE = ['usage-tracking', 'themes', 'beyond', 'guides'] as const

/**
 * The /resources page body, laid out as a directory: the title and one sentence, the status line
 * tools (what most visitors search for) and the gallery status lines that do the same jobs, every
 * way to customize Claude Code, the plugin marketplaces beside our marketplace command, the smaller
 * sections side by side, then a way to get listed. Entries are compact cards in grids, each section
 * titled with a short intro under it. `showcase` gives a compared tool its alternatives page and the
 * rendered status lines; `origin` is the site's, for the marketplace command. A component (not
 * inline in the route) so it's unit-testable, the same pattern as TermsContent.
 */
export function ResourcesContent({
  signedIn,
  showcase,
  origin,
}: {
  signedIn: boolean
  showcase: ResourcesShowcase
  origin: string
}) {
  const cards = (key: string) =>
    cardsOf(sectionOf(key), showcase.alternatives).map(({ key: k, ...card }) => (
      <LinkCard key={k} {...card} />
    ))
  return (
    <>
      <HomeSection first>
        <PageHeader title={RESOURCES_HEADING} lead={RESOURCES_LEAD} />
      </HomeSection>

      <DirectorySection
        title={sectionOf('tools').title}
        intro={
          <Text muted>
            Compare{' '}
            <TextLink to="/compare/$pair" params={{ pair: 'ccstatusline-vs-claude-powerline' }}>
              ccstatusline vs claude-powerline
            </TextLink>
            , see <TextLink to="/status-lines/best">the best status lines</TextLink>, browse{' '}
            <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
              ones that show token usage
            </TextLink>
            , or <TextLink to="/guide">write your own</TextLink>.
          </Text>
        }
      >
        <TileGrid>{cards('tools')}</TileGrid>
      </DirectorySection>

      {showcase.cards.length > 0 ? (
        <DirectorySection
          title="Status lines that do the same job"
          intro={
            <Text muted>
              Status lines from the gallery that cover at least three of the same features as these
              tools, each shown with its real output. Copy one in a single paste.
            </Text>
          }
        >
          <RankedCardList items={showcase.cards} surface="resources" />
        </DirectorySection>
      ) : null}

      <DirectorySection
        title="What you can customize"
        intro={
          <Text muted>
            Eight ways to change Claude Code, each with Anthropic's docs and, where the gallery has
            some, examples to install.
          </Text>
        }
      >
        <CustomizationMap />
      </DirectorySection>

      <DirectorySection
        title={sectionOf('marketplaces').title}
        intro={
          <Stack gap={4}>
            <Text muted>
              Mods are Claude Code plugins. Each comes from a marketplace: Anthropic's, a community
              one, or ours.
            </Text>
            <MarketplaceLine origin={origin} />
          </Stack>
        }
      >
        <TileGrid>{cards('marketplaces')}</TileGrid>
      </DirectorySection>

      <DirectorySection title="More tools and lists">
        <ColumnGrid>
          {MORE.map((key) => (
            <Stack key={key} gap={3}>
              <Heading level={2} size="compact">
                {sectionOf(key).title}
              </Heading>
              {key === 'usage-tracking' ? (
                <Text muted size="sm">
                  Or watch your limits inside Claude Code with{' '}
                  <TextLink to="/status-lines/$facet" params={{ facet: 'quota' }}>
                    status lines and mods that track usage limits
                  </TextLink>
                  .
                </Text>
              ) : null}
              {cards(key)}
            </Stack>
          ))}
        </ColumnGrid>
      </DirectorySection>

      <DirectorySection
        title="Get listed"
        intro={
          <Text muted>
            Made a status line or mod? <TextLink to="/submit">Submit it</TextLink> for its own page
            in the gallery. Built a tool for this list? Email{' '}
            <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>.
          </Text>
        }
      >
        <Row gap={3}>
          <SubmitCta signedIn={signedIn} />
        </Row>
      </DirectorySection>
    </>
  )
}

/**
 * A section's resources as cards. A compared tool (one with an alternatives page) opens that page,
 * where its rendered alternatives sit beside its facts, and keeps its repo as a link under its name.
 * Anything else opens off-site, and its note says where.
 */
function cardsOf(
  section: ResourceSection,
  alternatives: Record<string, string>,
): Array<ComponentProps<typeof LinkCard> & { key: string }> {
  return section.resources.map((r) => {
    const tool = alternatives[r.url]
    return {
      key: r.url,
      id: resourceAnchor(r.name),
      title: tool ? (
        <StretchedLink to="/alternatives/$tool" params={{ tool }}>
          {r.name} <VisuallyHidden>alternatives</VisuallyHidden>
        </StretchedLink>
      ) : (
        <StretchedLink href={r.url}>{r.name}</StretchedLink>
      ),
      meta: tool ? (
        <>
          Opens its alternatives · <TextLink href={r.url}>{domainLabel(r.url)}</TextLink>
        </>
      ) : (
        domainLabel(r.url)
      ),
      description: r.description,
    }
  })
}

/** Short destination label for a resource's note. */
function domainLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  if (host === 'github.com') return 'GitHub'
  if (host === 'code.claude.com') return 'docs'
  return host
}
