/**
 * The statuslin.es wordmark: monospace, white text, with the dot in the coral `--primary`. The DOM
 * counterpart to src/og/card.tsx's drawWordmark() — same look, drawn for the browser with tokens
 * instead of satori inline styles. Closed component: pick a size variant, no className.
 */
const SIZE = {
  header: 'text-base',
  hero: 'text-5xl',
} as const

export function Wordmark({ size = 'header' }: { size?: keyof typeof SIZE }) {
  return (
    <span className={`font-mono font-semibold ${SIZE[size]} text-foreground`}>
      statuslin
      <span data-wordmark-dot className="text-primary">
        .
      </span>
      es
    </span>
  )
}
