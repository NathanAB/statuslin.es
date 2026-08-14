import { CONTACT_EMAIL } from '@/lib/site'
import { RESOURCE_SECTIONS } from '@/resources/data'
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
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line tools & resources</Heading>

        <Text muted>
          A short, opinionated list of status line tools and reading we'd point a friend at. The
          descriptions are ours, not the projects' own marketing. Want a rendered status line you
          can copy? <TextLink to="/">Browse the gallery</TextLink>. Wiring a script by hand? See the{' '}
          <TextLink to="/guide">setup guide</TextLink>.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Four ways to get a status line</Heading>
        <Text muted>
          The built-in{' '}
          <Text inline mono>
            /statusline
          </Text>{' '}
          command is the fastest start: describe what you want inside Claude Code, and it writes the
          script and settings for you. Use it if you don't have a status line yet.
        </Text>
        <Text muted>
          Install a tool from the list below if you want a terminal UI, themes, or widgets without
          maintaining a script. Start with ccstatusline or claude-powerline.
        </Text>
        <Text muted>
          Copy a reviewed script from <TextLink to="/">the gallery</TextLink> if you want a rendered
          preview and a one-paste install — no extra runtime. Powerline look:{' '}
          <TextLink to="/c/$slug" params={{ slug: 'powerline-dracula-6936b97c' }}>
            Powerline Dracula
          </TextLink>
          . Token counters:{' '}
          <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
            status lines that show token usage
          </TextLink>
          . Looking for ohugonnot/claude-code-statusline?{' '}
          <TextLink to="/c/$slug" params={{ slug: 'quota-fallback-2a730aa6' }}>
            Quota Fallback
          </TextLink>{' '}
          is the reviewed gallery copy.
        </Text>
        <Text muted>
          Write a script by hand when you want to own every field. The{' '}
          <TextLink to="/guide">setup guide</TextLink> uses the same JSON this site uses for gallery
          previews, and a script the tests execute on every commit.
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
                    <CardTitle>
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
              If you've made a status line you like,{' '}
              <TextLink to="/submit">submit it to the gallery</TextLink> and it gets its own preview
              page. Built a tool that belongs on this list? Email{' '}
              <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink> and we'll take a
              look.
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
