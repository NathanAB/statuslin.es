import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { CHECK_STEPS } from '@/how-it-works/steps'
import { HOW_IT_WORKS_PATH } from '@/lib/page-title'
import { Button } from '@/ui/button'
import { HomeSection } from '@/ui/home-section'
import { IconList } from '@/ui/icon-list'
import { Row, Stack } from '@/ui/layout'
import { Heading } from '@/ui/text'

const TITLE = 'How listings are checked'

/**
 * The home page's section on trust, between the hero and the gallery: the four checks every
 * status line and mod passes, a line each, under a title with the way to /how-it-works, which
 * shows each one.
 */
export function HomeChecks() {
  const headingId = useId()
  return (
    <HomeSection labelledBy={headingId}>
      <Stack gap={6}>
        <Row gap={4} justify="between" wrap>
          <Heading level={2} size="subsection" id={headingId}>
            {TITLE}
          </Heading>
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
