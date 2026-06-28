import type { AnsiSegment } from '@/render/types'

/** Renders captured statusline output as escaped, styled spans. NEVER use dangerouslySetInnerHTML —
 * segment text is untrusted. The per-segment colors come from the script's own ANSI output, so they
 * are the one allowed inline-style exception (see scripts/check-frontend.ts INLINE_STYLE_ALLOW). */
export function StatuslinePreview({ segments }: { segments: AnsiSegment[] }) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <code className="inline-block whitespace-pre rounded-md bg-sunken px-3 py-1.5 font-mono text-foreground text-sm">
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
