import { Wordmark } from '@/ui/wordmark'

/**
 * Home-page hero: the statuslin.es wordmark at hero size with the target keyword as a visible
 * subtitle beneath it, both inside the one h1. The keyword used to sit in an sr-only span, which
 * spent the page's most important heading on a brand nobody searches for and left the phrase
 * invisible to readers. The subtitle inherits the h1's mono font, so it reads as a terminal label.
 */
export function HomeHero() {
  return (
    <h1 className="text-center font-mono text-[clamp(1.5rem,10vw,3rem)] text-foreground">
      <Wordmark size="hero" />
      {/* Explicit separator: JSX drops the whitespace between sibling elements, so without it the
          heading reads "statuslin.esClaude Code status lines" to a screen reader. The subtitle is
          `block`, so the space collapses and nothing moves on screen. */}{' '}
      <span className="mt-3 block text-lg text-muted-foreground">Claude Code status lines</span>
    </h1>
  )
}
