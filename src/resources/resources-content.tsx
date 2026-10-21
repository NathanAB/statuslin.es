import type { ResourcesShowcase } from '@/compare/pages'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { CONTACT_EMAIL } from '@/lib/site'
import { MarketplaceLine } from '@/mods/marketplace-line'
import { CustomizeHero } from '@/resources/customize-hero'
import { RESOURCE_SECTIONS, type ResourceSection, resourceAnchor } from '@/resources/data'
import { HomeSection } from '@/ui/home-section'
import { ColumnGrid, Row, Split, Stack } from '@/ui/layout'
import { type LinkRow, LinkRows } from '@/ui/link-rows'
import { Panel } from '@/ui/panel'
import { StretchedLink } from '@/ui/stretched-link'
import { SubmitCta } from '@/ui/submit-cta'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/** A section of src/resources/data.ts by key; a missing one is a typo here, so it fails loudly. */
function sectionOf(key: string): ResourceSection {
  const section = RESOURCE_SECTIONS.find((s) => s.key === key)
  if (!section) throw new Error(`No /resources section "${key}"`)
  return section
}
// The small sections, side by side under the status line tools.
const MORE = ['usage-tracking', 'themes', 'beyond', 'guides'] as const

/**
 * The /resources page body, on the home page's sections: the Claude Code session with every way to
 * customize it, the plugin marketplaces on a field of their own beside our marketplace command, the
 * status line tools and the gallery status lines that do the same jobs, the smaller sections side by
 * side, then a way to get listed. `showcase` gives a compared tool its alternatives page and the
 * rendered status lines; `origin` is the site's, for the marketplace command. A component (not inline
 * in the route) so it's unit-testable, the same pattern as TermsContent.
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
  const rows = (key: string) => rowsOf(sectionOf(key), showcase.alternatives)
  return (
    <>
      <HomeSection first>
        <CustomizeHero />
      </HomeSection>

      <HomeSection>
        <Panel size="band">
          <Split
            start={
              <>
                <Heading level={2} size="section">
                  {sectionOf('marketplaces').title}
                </Heading>
                <Text size="lead">
                  Mods are Claude Code plugins. Each comes from a marketplace: Anthropic's, a
                  community one, or ours.
                </Text>
                <MarketplaceLine origin={origin} />
              </>
            }
            end={<LinkRows items={rows('marketplaces')} />}
          />
        </Panel>
      </HomeSection>

      <HomeSection>
        <Stack gap={9}>
          <Split
            start={
              <Heading level={2} size="section">
                {sectionOf('tools').title}
              </Heading>
            }
            end={
              <Stack gap={4}>
                <Text size="lead">
                  Compare{' '}
                  <TextLink
                    to="/compare/$pair"
                    params={{ pair: 'ccstatusline-vs-claude-powerline' }}
                  >
                    ccstatusline vs claude-powerline
                  </TextLink>
                  , see <TextLink to="/status-lines/best">the best status lines</TextLink>, or{' '}
                  <TextLink to="/guide">write your own</TextLink>.
                </Text>
                <Text muted>
                  Browse{' '}
                  <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
                    status lines that show token usage
                  </TextLink>
                  .{' '}
                  <TextLink to="/c/$slug" params={{ slug: 'quota-fallback-2a730aa6' }}>
                    Quota Fallback
                  </TextLink>{' '}
                  is the reviewed copy of ohugonnot/claude-code-statusline.
                </Text>
              </Stack>
            }
          />
          <LinkRows columns={2} items={rows('tools')} />
          {showcase.cards.length > 0 ? (
            <Stack gap={6}>
              <Split
                start={<Heading level={2}>Status lines that do the same job</Heading>}
                end={
                  <Text muted>
                    Status lines from the gallery that cover at least three of the same features as
                    these tools, each shown with its real output. Copy one in a single paste.
                  </Text>
                }
              />
              <RankedCardList items={showcase.cards} surface="resources" />
            </Stack>
          ) : null}
        </Stack>
      </HomeSection>

      <HomeSection>
        <ColumnGrid>
          {MORE.map((key) => (
            <Stack key={key} gap={3}>
              <Heading level={2}>{sectionOf(key).title}</Heading>
              {key === 'usage-tracking' ? (
                <Text muted>
                  Or watch your limits inside Claude Code with{' '}
                  <TextLink to="/status-lines/$facet" params={{ facet: 'quota' }}>
                    status lines and mods that track usage limits
                  </TextLink>
                  .
                </Text>
              ) : null}
              <LinkRows items={rows(key)} />
            </Stack>
          ))}
        </ColumnGrid>
      </HomeSection>

      <HomeSection>
        <Split
          start={
            <Heading level={2} size="section">
              Get listed
            </Heading>
          }
          end={
            <Stack gap={6}>
              <Text size="lead">
                Made a status line or mod? <TextLink to="/submit">Submit it</TextLink> for its own
                page in the gallery. Built a tool for this list? Email{' '}
                <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>.
              </Text>
              <Row gap={3}>
                <SubmitCta signedIn={signedIn} />
              </Row>
            </Stack>
          }
        />
      </HomeSection>
    </>
  )
}

/**
 * A section's resources as rows. A compared tool (one with an alternatives page) opens that page,
 * where its rendered alternatives sit beside its facts, and keeps its repo as a link under its name.
 * Anything else opens off-site, and its note says where.
 */
function rowsOf(section: ResourceSection, alternatives: Record<string, string>): LinkRow[] {
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
