import { Wordmark } from '@/ui/wordmark'

/**
 * Home-page hero: the shared statuslin.es wordmark at hero size, centered, with the terminal block
 * cursor after it. Same wordmark (coral dot) as the app header — just larger. The h1 keeps the mono
 * family + 5xl size so the cursor matches the wordmark; the wordmark also sets its own.
 */
export function HomeHero() {
  return (
    <h1 className="text-center font-mono text-[clamp(1.5rem,10vw,3rem)] text-foreground">
      <Wordmark size="hero" />▒
    </h1>
  )
}
