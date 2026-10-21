import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { useId, useState } from 'react'
import {
  CUSTOMIZATION_SURFACES,
  type CustomizationSurface,
  SURFACE_BY_KEY,
} from '@/resources/surfaces'
import { Button } from '@/ui/button'
import { ChoiceGroup } from '@/ui/choice-group'
import { type CustomizeFocus, CustomizeScreen } from '@/ui/customize-screen'
import { HeroLayout } from '@/ui/hero-layout'
import { Row, Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'
import { LiveMessage, VisuallyHidden } from '@/ui/visually-hidden'

const RESOURCES_HEADING = 'Claude Code customization tools & resources'
// Most of the page's searches are a status line tool's name, so its first sentence names the two
// biggest (Search Console, 2026-07-21 to 2026-10-20).
const RESOURCES_LEAD =
  'Every way to change Claude Code, from status line tools like ccstatusline and claude-powerline to mods and themes. Pick one to see where it lives.'
const SCREEN_CAPTION =
  "An example session. The pane and the band above the prompt are mods; the rest is Claude Code's own."

/**
 * The top of /resources, on the home hero's layout: a Claude Code session with a place for every way
 * to customize it, the ways beside it to pick from, and under them what the pick changes, its docs
 * and where to find some. The first paint shows mods.
 */
export function CustomizeHero() {
  const pickerId = useId()
  const [focus, setFocus] = useState<CustomizeFocus>('mods')
  const [changed, setChanged] = useState(false)
  const surface = SURFACE_BY_KEY[focus]

  return (
    <HeroLayout
      heading={RESOURCES_HEADING}
      lead={RESOURCES_LEAD}
      stage={<CustomizeScreen focus={focus} label={surface.screen} caption={SCREEN_CAPTION} />}
      pickerFirst
      picker={
        <>
          <Heading level={2} size="compact" id={pickerId}>
            Pick what to customize
          </Heading>
          <ChoiceGroup
            look="list"
            rise
            labelledBy={pickerId}
            options={CUSTOMIZATION_SURFACES.map((s) => ({
              value: s.key,
              label: s.name,
              detail: s.detail,
            }))}
            value={focus}
            onValueChange={(next) => {
              setFocus(next)
              setChanged(true)
            }}
          />
        </>
      }
      actions={
        <>
          {/* Every way's words and links are in the page from the first paint, for search engines
              and readers without script; only the pick's show. */}
          {CUSTOMIZATION_SURFACES.map((s) => (
            <div key={s.key} hidden={s.key !== focus}>
              <SurfaceActions surface={s} />
            </div>
          ))}
          <LiveMessage>{changed ? surface.screen : ''}</LiveMessage>
        </>
      }
    />
  )
}

/** What one way changes, then a pill to browse ones here (when there are) and one to its docs. */
function SurfaceActions({ surface }: { surface: CustomizationSurface }) {
  const [first, ...more] = surface.browse
  return (
    <Stack gap={4}>
      <Text>{surface.text}</Text>
      <Row gap={3} align="center" wrap>
        {first ? (
          <Button asChild size="pill" trailingIcon={<ArrowRight />}>
            <Link to={first.to}>{first.label}</Link>
          </Button>
        ) : null}
        <Button asChild size="pill" variant="secondary" trailingIcon={<ArrowUpRight />}>
          <a href={surface.docsUrl} target="_blank" rel="noopener noreferrer">
            Anthropic's docs <VisuallyHidden>on {surface.name.toLowerCase()}</VisuallyHidden>
          </a>
        </Button>
        {more.map((link) => (
          <TextLink key={link.to} to={link.to} tone="underlined">
            {link.label}
          </TextLink>
        ))}
      </Row>
    </Stack>
  )
}
