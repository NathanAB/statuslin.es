import { listPhrase } from '@/gallery/why-line'
import { BUDDY_FAQ } from '@/guide/buddy-faq'
import { BuddyPetSection } from '@/guide/buddy-pet-section'
import {
  BUDDY_ISSUE_NUMBER,
  BUDDY_ISSUE_URL,
  type SharedCommand,
  sharedCommands,
} from '@/guide/buddy-pets'
import { MOD_SAFETY_GUIDE_PATH } from '@/lib/page-title'
import { MODS_PATH } from '@/lib/site'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'
import type { ModDetail } from '@/mods/queries'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { Heading, Text, TextLink } from '@/ui/text'

/** "Claude Pets and Pixipet both add `/pet`": two pets that add one command can't share a session. */
function clashLine({ command, titles }: SharedCommand): string {
  const all = titles.length === 2 ? 'both' : 'all'
  return `${listPhrase(titles)} ${all} add \`/${command}\`, so install only one of them.`
}

/**
 * The /guide/claude-code-buddy page body: what happened to /buddy, then each published pet mod
 * with its previews, reach and install prompt. A pet that isn't published yet is left out.
 */
export function BuddyGuideContent({ pets, origin }: { pets: ModDetail[]; origin: string }) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code /buddy removed? Pet mods that replace it</Heading>
        <Text muted>
          <InlineCodeText text="Claude Code 2.1.97 removed `/buddy`, the small ASCII creature that reacted to your work, in April 2026." />{' '}
          The community issue asking for it back is{' '}
          <TextLink href={BUDDY_ISSUE_URL}>Bring Back Buddy, #{BUDDY_ISSUE_NUMBER}</TextLink>.
        </Text>
        <Text muted>
          These pet mods put a pixel companion back in your session. None of them is buddy, and none
          brings back the one you had. Each is a plugin someone in the community wrote, and it runs
          inside Claude Code with your permissions. statuslin.es recorded each one in a real
          session, and its tiles say what its code can touch. Mods need Claude Code{' '}
          {MOD_INSTALL_MIN_VERSION} or later.{' '}
          <TextLink to={MOD_SAFETY_GUIDE_PATH}>What to check before you install a mod</TextLink>.
        </Text>
      </Stack>

      <Stack gap={6}>
        <Heading level={2}>Pet mods</Heading>
        {pets.length === 0 ? (
          <Text muted>
            No pet mods are published yet. <TextLink to={MODS_PATH}>Browse every mod</TextLink>.
          </Text>
        ) : (
          <>
            {sharedCommands(pets).map((shared) => (
              <Notice key={shared.command} tone="info">
                <InlineCodeText text={clashLine(shared)} />
              </Notice>
            ))}
            {pets.map((pet) => (
              <BuddyPetSection key={pet.slug} pet={pet} origin={origin} />
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
