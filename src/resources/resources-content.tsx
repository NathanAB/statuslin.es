import { Fragment } from 'react'
import type { ResourcesShowcase } from '@/compare/pages'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { CONTACT_EMAIL } from '@/lib/site'
import { RESOURCE_SECTIONS, type Resource, resourceAnchor } from '@/resources/data'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Grid, Row, Stack } from '@/ui/layout'
import { StretchedLink } from '@/ui/stretched-link'
import { SubmitCta } from '@/ui/submit-cta'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/**
 * The /resources page body: the curated list from src/resources/data.ts rendered as
 * cards by section, framed by an intro that cross-links the guide and gallery, and a
 * closing "get listed" call-to-action. A component (not inline in the route) so it's
 * unit-testable — same pattern as TermsContent. `showcase` turns the tool list into something to
 * act on: rendered status lines that do the same jobs, and a compared tool's card opening its
 * alternatives page before its repo.
 */
export function ResourcesContent({
  signedIn,
  showcase,
}: {
  signedIn: boolean
  showcase: ResourcesShowcase
}) {
  return (
    <Stack gap={6}>
      <Heading level={1}>Claude Code status line tools & resources</Heading>

      <Stack gap={3}>
        <Heading level={2}>Four ways to get a status line</Heading>
        <Text muted>
          Run{' '}
          <Text inline mono>
            /statusline
          </Text>{' '}
          in Claude Code and describe what you want. It writes the script and settings for you.
          Start here if you have no status line yet.
        </Text>
        <Text muted>
          Install a tool from the list below for a setup screen, themes or widgets without keeping a
          script yourself. Start with ccstatusline or claude-powerline. Compare{' '}
          <TextLink to="/compare/$pair" params={{ pair: 'ccstatusline-vs-claude-powerline' }}>
            ccstatusline vs claude-powerline
          </TextLink>
          ,{' '}
          <TextLink to="/alternatives/$tool" params={{ tool: 'ccstatusline' }}>
            ccstatusline alternatives
          </TextLink>{' '}
          or{' '}
          <TextLink to="/alternatives/$tool" params={{ tool: 'claude-powerline' }}>
            claude-powerline alternatives
          </TextLink>
          .
        </Text>
        <Text muted>
          Copy a reviewed script from <TextLink to="/">the gallery</TextLink> after seeing its real
          output. Try the <TextLink to="/status-lines/best">most-installed</TextLink>,{' '}
          <TextLink to="/c/$slug" params={{ slug: 'powerline-dracula-6936b97c' }}>
            Powerline Dracula
          </TextLink>{' '}
          or{' '}
          <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
            status lines that show token usage
          </TextLink>
          .{' '}
          <TextLink to="/c/$slug" params={{ slug: 'quota-fallback-2a730aa6' }}>
            Quota Fallback
          </TextLink>{' '}
          is the reviewed copy of ohugonnot/claude-code-statusline.
        </Text>
        <Text muted>
          Write your own to control every field. The{' '}
          <TextLink to="/guide">guide to writing one</TextLink> walks through the JSON Claude Code
          sends, with a script our tests run on every pull request.
        </Text>
      </Stack>

      {RESOURCE_SECTIONS.map((section) => (
        <Fragment key={section.key}>
          <Stack gap={3}>
            <Heading level={2}>{section.title}</Heading>
            <Grid>
              {section.resources.map((r) => (
                <ResourceCard key={r.url} resource={r} tool={showcase.alternatives[r.url]} />
              ))}
            </Grid>
          </Stack>
          {section.key === 'tools' && showcase.cards.length > 0 ? (
            <Stack gap={4}>
              <Stack gap={2}>
                <Heading level={2}>Status lines that do the same job</Heading>
                <Text muted>
                  Single scripts from the gallery that cover at least three of the same features as
                  these tools, each shown with its real output. Copy one in a single paste.
                </Text>
              </Stack>
              <RankedCardList items={showcase.cards} surface="resources" />
            </Stack>
          ) : null}
        </Fragment>
      ))}

      <Card>
        <CardContent>
          <Stack gap={3}>
            <Heading level={2}>Get listed</Heading>
            <Text muted>
              Made a status line or mod? <TextLink to="/submit">Submit it</TextLink> for its own
              page in the gallery. Built a tool for this list? Email{' '}
              <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>.
            </Text>
            <Row gap={3}>
              <SubmitCta signedIn={signedIn} />
            </Row>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}

/**
 * One listed resource. A compared tool (`tool`, its alternatives page) opens that page, where its
 * rendered alternatives sit beside its facts; its repo stays a link in the corner. Anything else
 * opens off-site.
 */
function ResourceCard({ resource: r, tool }: { resource: Resource; tool: string | undefined }) {
  return (
    <Card interactive>
      <CardHeader>
        <Row gap={2} justify="between">
          <CardTitle id={resourceAnchor(r.name)}>
            {tool ? (
              <StretchedLink to="/alternatives/$tool" params={{ tool }}>
                {r.name} <VisuallyHidden>alternatives</VisuallyHidden>
              </StretchedLink>
            ) : (
              <StretchedLink href={r.url}>{r.name}</StretchedLink>
            )}
          </CardTitle>
          {tool ? (
            <Row gap={1} aboveOverlay>
              <TextLink href={r.url} size="sm">
                {domainLabel(r.url)}
              </TextLink>
            </Row>
          ) : (
            <Badge variant="outline">{domainLabel(r.url)}</Badge>
          )}
        </Row>
      </CardHeader>
      <CardContent>
        <Stack gap={2}>
          <Text muted size="sm">
            {r.description}
          </Text>
          {tool ? (
            <Text size="sm">Compare it with rendered status lines that do the same job.</Text>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  )
}

/** Short destination label for a resource card's badge. */
function domainLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  if (host === 'github.com') return 'GitHub'
  if (host === 'gist.github.com') return 'gist'
  if (host === 'code.claude.com') return 'docs'
  if (host === 'npmjs.com') return 'npm'
  return host
}
