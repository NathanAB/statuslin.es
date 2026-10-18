import { MOD_ROUTE } from '@/lib/site'
import { ModInstallPrompt } from '@/mods/install-prompt'
import { modFactTiles } from '@/mods/mod-fact-tiles'
import { ModPreview } from '@/mods/mod-preview'
import type { ModDetail } from '@/mods/queries'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { FactTiles } from '@/ui/fact-tiles'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * One pet on /guide/claude-code-buddy, the way its mod page shows it: its name linking there, what
 * it does, its full recorded previews (a card's crop cuts a pane pet in half), what it can touch
 * and the same counted install prompt.
 */
export function BuddyPetSection({ pet, origin }: { pet: ModDetail; origin: string }) {
  const copyController = useRecordModCopy(pet.id, pet.copyCount)
  const headingId = `pet-${pet.slug}`
  return (
    <section aria-labelledby={headingId}>
      <Stack gap={3}>
        <Heading level={3} id={headingId}>
          <TextLink to={MOD_ROUTE} params={{ slug: pet.slug }}>
            {pet.title}
          </TextLink>
        </Heading>
        <Text muted>
          <InlineCodeText text={pet.generatedContent?.summary ?? pet.description} />
        </Text>
        <ModPreview mod={pet} />
        <FactTiles tiles={modFactTiles(pet)} />
        <ModInstallPrompt
          origin={origin}
          slug={pet.slug}
          title={pet.title}
          controller={copyController}
        />
      </Stack>
    </section>
  )
}
