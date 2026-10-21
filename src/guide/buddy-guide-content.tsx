import type { GalleryModCard } from '@/gallery/gallery-items'
import { listPhrase } from '@/gallery/why-line'
import { BUDDY_FAQ } from '@/guide/buddy-faq'
import { BUDDY_ISSUE_NUMBER, BUDDY_ISSUE_URL, type SharedCommand } from '@/guide/buddy-pets'
import { MOD_SAFETY_GUIDE_PATH } from '@/lib/page-title'
import { MODS_PATH } from '@/lib/site'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'
import { ModCard } from '@/mods/mod-card'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { Heading, Text, TextLink } from '@/ui/text'

/** "Pixel Cat and Pixipet both add `/mods`. Install one.": two pets that add one command clash. */
function clashLine({ command, titles }: SharedCommand): string {
  const all = titles.length === 2 ? 'both' : 'all'
  return `${listPhrase(titles)} ${all} add \`/${command}\`. Install one.`
}

/**
 * The /guide/claude-code-buddy page body: what happened to /buddy, then each published pet mod as
 * the gallery's card, which links to its mod page (previews, fact tiles, install). A note above
 * the cards names each slash command two or more of them add.
 */
export function BuddyGuideContent({
  cards,
  clashes,
}: {
  cards: GalleryModCard[]
  clashes: SharedCommand[]
}) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code /buddy removed? Pet mods that replace it</Heading>
        <Text muted>
          <InlineCodeText text="`/buddy` came in Claude Code 2.1.89 for April 1st. Users report it gone since 2.1.97, though the changelog doesn't say so" />{' '}
          (<TextLink href={BUDDY_ISSUE_URL}>Bring Back Buddy, #{BUDDY_ISSUE_NUMBER}</TextLink>).
          These community pet mods put a pixel companion back. They're new pets, not your old buddy.
        </Text>
        <Text muted>
          Each runs with your permissions. Open a pet to see its recorded preview and what its code
          can touch. Mods need Claude Code {MOD_INSTALL_MIN_VERSION} or later.{' '}
          <TextLink to={MOD_SAFETY_GUIDE_PATH}>What to check before you install a mod</TextLink>.
        </Text>
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Pet mods</Heading>
        {cards.length === 0 ? (
          <Text muted>
            No pet mods are published yet. <TextLink to={MODS_PATH}>Browse every mod</TextLink>.
          </Text>
        ) : (
          <>
            {clashes.map((clash) => (
              <Notice key={clash.command} tone="info">
                <InlineCodeText text={clashLine(clash)} />
              </Notice>
            ))}
            {cards.map((card, index) => (
              <ModCard
                key={card.slug}
                card={card}
                analytics={{ surface: 'buddy_guide', position: index + 1 }}
              />
            ))}
          </>
        )}
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Made your own pet?</Heading>
        <Text muted>
          <TextLink to="/submit">Submit your pet mod or pet status line</TextLink> and it gets the
          same review and recorded preview.
        </Text>
      </Stack>

      <FaqSection entries={BUDDY_FAQ} />
    </Stack>
  )
}
