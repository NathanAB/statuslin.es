import { CONTACT_EMAIL } from '@/lib/site'
import { RESOURCE_SECTIONS } from '@/resources/data'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * The /resources page body: the curated list from src/resources/data.ts rendered by
 * section, framed by an intro that cross-links the guide and gallery, and a closing
 * "get listed" call-to-action. A component (not inline in the route) so it's
 * unit-testable — same pattern as TermsContent.
 */
export function ResourcesContent() {
  return (
    <Stack gap={6}>
      <Heading level={1}>Claude Code status line tools & resources</Heading>

      <Text muted measure>
        A short, opinionated list of the status line tools and reading we'd point a friend at. The
        descriptions are ours, not the projects' own marketing. If you want a good status line
        without installing anything, <TextLink to="/">the gallery</TextLink> is full of
        ready-to-copy examples.
      </Text>

      {/* NOTE (Task 5 adds the "setup guide" sentence here): the /guide route doesn't
          exist until Task 4, and TextLink's `to` is typed against the route tree, so
          the cross-link into the guide lands in the wiring task. */}

      {RESOURCE_SECTIONS.map((section) => (
        <Stack gap={3} key={section.key}>
          <Heading level={2}>{section.title}</Heading>
          {section.resources.map((r) => (
            <Stack gap={1} key={r.url}>
              <TextLink href={r.url}>{r.name}</TextLink>
              <Text muted size="sm" measure>
                {r.description}
              </Text>
            </Stack>
          ))}
        </Stack>
      ))}

      <Stack gap={2}>
        <Heading level={2}>Get listed</Heading>
        <Text muted measure>
          If you've made a status line you like,{' '}
          <TextLink to="/submit">submit it to the gallery</TextLink> and it gets its own preview
          page. Built a tool that belongs on this list? Email{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink> and we'll take a
          look.
        </Text>
      </Stack>
    </Stack>
  )
}
