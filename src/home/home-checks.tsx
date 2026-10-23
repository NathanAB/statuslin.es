import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { CHECK_STEPS } from '@/how-it-works/steps'
import { HOW_IT_WORKS_PATH } from '@/lib/page-title'
import { REPO_URL } from '@/lib/site'
import { Button } from '@/ui/button'
import { HomeSection } from '@/ui/home-section'
import { IconList } from '@/ui/icon-list'
import { Row, Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

const TITLE = 'How listings are checked'

/**
 * The home page's section on trust, on its own band after the gallery: the four checks every
 * status line and mod passes, a line each, under a title that says the checks are open source,
 * with the way to /how-it-works, which shows each one.
 */
export function HomeChecks() {
  const headingId = useId()
  return (
    <HomeSection labelledBy={headingId} band>
      <Stack gap={6}>
        <Row gap={4} justify="between" wrap>
          <Stack gap={2}>
            <Heading level={2} size="subsection" id={headingId}>
              {TITLE}
            </Heading>
            <Text muted>
              statuslin.es is open source, and every check below is code you can{' '}
              <TextLink href={REPO_URL}>read on GitHub</TextLink>.
            </Text>
          </Stack>
          <Button asChild variant="secondary" size="pill" trailingIcon={<ArrowRight />}>
            <Link to={HOW_IT_WORKS_PATH}>How it works</Link>
          </Button>
        </Row>
        <IconList
          label={TITLE}
          look="cards"
          items={CHECK_STEPS.map(({ icon, title, summary }) => ({ icon, title, text: summary }))}
        />
      </Stack>
    </HomeSection>
  )
}
