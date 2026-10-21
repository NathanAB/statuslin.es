import { Fragment } from 'react'
import type { ResourcesShowcase } from '@/compare/pages'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { CONTACT_EMAIL } from '@/lib/site'
import { CustomizationOverview } from '@/resources/customization-overview'
import { RESOURCE_SECTIONS, type Resource, resourceAnchor } from '@/resources/data'
import { SectionIntro } from '@/resources/section-intro'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Grid, Row, Stack } from '@/ui/layout'
import { StretchedLink } from '@/ui/stretched-link'
import { SubmitCta } from '@/ui/submit-cta'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/**
 * The /resources page body: every way to customize Claude Code first, then the curated list from
 * src/resources/data.ts as cards by section, each with its intro line where one earns a place, and
 * a closing "get listed" call-to-action. A component (not inline in the route) so it's unit-testable,
 * the same pattern as TermsContent. `showcase` turns the status line tools into something to act on:
 * rendered status lines that do the same jobs, and a compared tool's card opening its alternatives
 * page before its repo. `origin` is the site's, for the statuslin.es marketplace command.
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
  return (
    <Stack gap={6}>
      <Heading level={1}>Claude Code customization tools & resources</Heading>

      <CustomizationOverview />

      {RESOURCE_SECTIONS.map((section) => (
        <Fragment key={section.key}>
          <Stack gap={3}>
            <Heading level={2}>{section.title}</Heading>
            <SectionIntro sectionKey={section.key} origin={origin} />
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
                  Status lines from the gallery that cover at least three of the same features as
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
