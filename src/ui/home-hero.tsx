import { VisuallyHidden } from '@/ui/visually-hidden'
import { Wordmark } from '@/ui/wordmark'

/**
 * Home-page hero: the shared statuslin.es wordmark at hero size, centered. The visible text is
 * unchanged; a screen-reader-only phrase adds the target
 * keyword so the h1 reads "statuslin.es Claude Code status lines" to crawlers and assistive tech.
 */
export function HomeHero() {
  return (
    <h1 className="text-center font-mono text-[clamp(1.5rem,10vw,3rem)] text-foreground">
      <Wordmark size="hero" />
      <VisuallyHidden>Claude Code status lines</VisuallyHidden>
    </h1>
  )
}
