import type { AnsiSegment } from '@/render/types'

// `well` sits the line in a dark code well; `bare` sets it straight on its surface at 15px, in the
// terminal's text colour, as the gallery rows show it.
const LOOK_CLASS = {
  well: 'inline-block rounded-md bg-sunken px-3 py-1.5 text-foreground text-sm',
  bare: 'block w-max text-[0.9375rem] text-terminal-foreground leading-normal',
} as const

/** Renders captured statusline output as escaped, styled spans. NEVER use dangerouslySetInnerHTML —
 * segment text is untrusted. The per-segment colors come from the script's own ANSI output, so they
 * are the one allowed inline-style exception (see scripts/check-frontend.ts INLINE_STYLE_ALLOW). */
export function StatuslinePreview({
  segments,
  look = 'well',
}: {
  segments: AnsiSegment[]
  look?: keyof typeof LOOK_CLASS
}) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <code className={`whitespace-pre font-mono ${LOOK_CLASS[look]}`}>
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
