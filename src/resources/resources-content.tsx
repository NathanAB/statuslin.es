import { CONTACT_EMAIL } from '@/lib/site'
import { RESOURCE_SECTIONS, resourceAnchor } from '@/resources/data'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Grid, Row, Stack } from '@/ui/layout'
import { StretchedLink } from '@/ui/stretched-link'
import { SubmitCta } from '@/ui/submit-cta'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * The /resources page body: the curated list from src/resources/data.ts rendered as
 * cards by section, framed by an intro that cross-links the guide and gallery, and a
 * closing "get listed" call-to-action. A component (not inline in the route) so it's
 * unit-testable — same pattern as TermsContent.
 */
export function ResourcesContent({ signedIn }: { signedIn: boolean }) {
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
          Copy a reviewed script from <TextLink to="/">the gallery</TextLink> to see its real output
          first. Try the <TextLink to="/status-lines/best">most-copied</TextLink>,{' '}
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
          Write your own to control every field. The <TextLink to="/guide">setup guide</TextLink>{' '}
          walks through the JSON Claude Code sends, with a script our tests run on every commit.
        </Text>
      </Stack>

      {RESOURCE_SECTIONS.map((section) => (
        <Stack gap={3} key={section.key}>
          <Heading level={2}>{section.title}</Heading>
          <Grid>
            {section.resources.map((r) => (
              <Card key={r.url} interactive>
                <CardHeader>
                  <Row gap={2} justify="between">
                    <CardTitle id={resourceAnchor(r.name)}>
                      <StretchedLink href={r.url}>{r.name}</StretchedLink>
                    </CardTitle>
                    <Badge variant="outline">{domainLabel(r.url)}</Badge>
                  </Row>
                </CardHeader>
                <CardContent>
                  <Text muted size="sm">
                    {r.description}
                  </Text>
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Stack>
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

/** Short destination label for a resource card's badge. */
function domainLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  if (host === 'github.com') return 'GitHub'
  if (host === 'gist.github.com') return 'gist'
  if (host === 'code.claude.com') return 'docs'
  if (host === 'npmjs.com') return 'npm'
  return host
}
