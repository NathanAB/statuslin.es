import { BulletList } from '@/ui/bullet-list'
import { Stack } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'
import { DRAW_LOCATION_LABEL, describeModFootprint, SURFACE_LABEL } from './footprint'
import type { ModDetail } from './queries'

export function FootprintSection({ mod }: { mod: ModDetail }) {
  const footprint = describeModFootprint(mod)
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Heading level={3}>Where it draws</Heading>
        {footprint.draws.length > 0 ? (
          <BulletList items={footprint.draws.map((location) => DRAW_LOCATION_LABEL[location])} />
        ) : (
          <Text muted size="sm">
            Nothing on screen.
          </Text>
        )}
      </Stack>
      <Stack gap={2}>
        <Heading level={3}>Surfaces</Heading>
        <BulletList items={footprint.surfaces.map((surface) => SURFACE_LABEL[surface])} />
      </Stack>
      <Stack gap={2}>
        <Heading level={3}>What it touches</Heading>
        {footprint.phrases.length > 0 && <BulletList items={footprint.phrases} />}
        {footprint.unknown.length > 0 && (
          <Text muted size="sm">
            Also uses, as written:
          </Text>
        )}
        {footprint.unknown.map((entry) => (
          <Text key={entry} mono size="sm" breakLong>
            {entry}
          </Text>
        ))}
        {footprint.phrases.length === 0 && footprint.unknown.length === 0 && (
          <Text muted size="sm">
            Nothing beyond its own drawing and state.
          </Text>
        )}
      </Stack>
    </Stack>
  )
}
