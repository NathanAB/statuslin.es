import { toast } from 'sonner'
import { InstallPromptButton } from '@/adopt/install-prompt-button'
import { reachSentence } from '@/gallery/config-install-facts'
import { AuthorByline } from '@/gallery/detail-byline'
import type { HeroLine } from '@/gallery/hero-lines'
import type { HeroItem } from '@/home/showcase'
import { siteUrl } from '@/lib/site'
import type { HeroMod } from '@/mods/gallery-queries'
import { modInstallPrompt } from '@/mods/install'
import { MOD_PASTE_HINT } from '@/mods/install-prompt'
import { modAuthor } from '@/mods/mod-author'
import { modReachSentence } from '@/mods/mod-install-facts'
import { CopyButton } from '@/ui/copy-button'
import { FactSentence } from '@/ui/fact-sentence'
import { HeroActions } from '@/ui/hero-layout'
import { TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

// "Open page" keeps the same visible words for every pick, so a long title never moves the row.

/**
 * Under the hero's picker for a status line: the install button (the same prompt as its page) and
 * its page, its kind and author, then what the script can reach.
 */
export function StatusLineHeroActions({
  line,
  onCopied,
}: {
  line: HeroLine
  onCopied: () => void
}) {
  return (
    <>
      <HeroActions>
        <InstallPromptButton
          configId={line.configId}
          versionId={line.versionId}
          title={line.title}
          onCopied={onCopied}
        />
        <TextLink to="/c/$slug" params={{ slug: line.slug }} tone="underlined">
          Open page<VisuallyHidden>: {line.title}</VisuallyHidden>
        </TextLink>
      </HeroActions>
      <AuthorByline kind="A status line" author={line.author} />
      <FactSentence fact={reachSentence(line)} />
    </>
  )
}

/**
 * The same for a mod: its install prompt (as on its page), its page, its kind and the repository
 * owner, then the risks its hooks take, from its footprint.
 */
export function ModHeroActions({ mod, onCopied }: { mod: HeroMod; onCopied: () => void }) {
  const fact = modReachSentence(mod.footprint)
  return (
    <>
      <HeroActions>
        <CopyButton
          text={modInstallPrompt(siteUrl(), mod.slug)}
          label="Copy install prompt"
          size="pill"
          variant="default"
          ariaLabel={`Copy install prompt for ${mod.title}`}
          onCopied={() => {
            onCopied()
            toast('Prompt copied', { description: MOD_PASTE_HINT })
          }}
        />
        <TextLink to="/mods/$slug" params={{ slug: mod.slug }} tone="underlined">
          Open page<VisuallyHidden>: {mod.title}</VisuallyHidden>
        </TextLink>
      </HeroActions>
      <AuthorByline kind="A mod" author={modAuthor(mod.authorGithub)} />
      {fact ? <FactSentence fact={fact} /> : null}
    </>
  )
}

/** The actions for whichever kind is picked. A mod's start fresh on each pick, so "Copied" never
 *  carries over to the next one. */
export function HeroItemActions({ item, onCopied }: { item: HeroItem; onCopied: () => void }) {
  return item.kind === 'mod' ? (
    <ModHeroActions key={item.mod.slug} mod={item.mod} onCopied={onCopied} />
  ) : (
    <StatusLineHeroActions line={item.line} onCopied={onCopied} />
  )
}
