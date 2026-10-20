import type { AnsiSegment } from '@/render/types'

// `well` sits the line in a small dark code well; `strip` sets it in the terminal's text colour on a
// full-width dark strip, so a gallery row's preview stands apart from the card. Both keep 14px text
// on the terminal's row height (leading-terminal), so half-block pixel art rows touch, no seams;
// `terminal` takes the home terminal's own text. Each look styles the scroller and the line.
const LOOK = {
  well: {
    scroller: '',
    line: 'inline-block rounded-md bg-sunken px-3 py-1.5 text-foreground text-sm leading-terminal',
  },
  strip: {
    scroller: 'rounded-xl bg-sunken px-4.5 py-3.5',
    line: 'block w-max text-sm leading-terminal text-terminal-foreground',
  },
  terminal: { scroller: '', line: 'block w-max' },
} as const

/** Renders captured statusline output as escaped, styled spans. NEVER use dangerouslySetInnerHTML —
 * segment text is untrusted. The per-segment colors come from the script's own ANSI output, so they
 * are the one allowed inline-style exception (see scripts/check-frontend.ts INLINE_STYLE_ALLOW). */
export function StatuslinePreview({
  segments,
  look = 'well',
}: {
  segments: AnsiSegment[]
  look?: keyof typeof LOOK
}) {
  return (
    // Inside the terminal, which is one image to a screen reader, an overflowing line must not
    // become a nameless tab stop (browsers make scrollers focusable).
    <div
      data-ui=""
      className={`min-w-0 max-w-full overflow-x-auto ${LOOK[look].scroller}`}
      tabIndex={look === 'terminal' ? -1 : undefined}
    >
      <code className={`whitespace-pre font-mono ${LOOK[look].line}`}>
        {segments.map((s, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed ordered render, no identity beyond position.
            key={i}
            style={{
              color: s.fg ?? undefined,
              background: s.bg ?? undefined,
              fontWeight: s.bold ? 'bold' : undefined,
              fontStyle: s.italic ? 'italic' : undefined,
              textDecoration: s.underline ? 'underline' : undefined,
            }}
          >
            {s.text}
          </span>
        ))}
      </code>
    </div>
  )
}
