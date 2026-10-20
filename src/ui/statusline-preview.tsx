import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/reduced-motion'
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
  const scroller = useRef<HTMLDivElement>(null)
  const { overflows, more } = useMoreToTheRight(scroller, look !== 'terminal')
  return (
    <div data-ui="" className="relative min-w-0 max-w-full">
      {/* Inside the terminal, which is one image to a screen reader, an overflowing line must not
          become a nameless tab stop (browsers make scrollers focusable). */}
      <div
        ref={scroller}
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
      {overflows ? (
        // Above a gallery row's whole-row link, so it can be pressed inside the row. At the end it
        // stays, marked unavailable, so a keyboard user's focus isn't dropped to the page.
        <button
          type="button"
          aria-label="Show more of this status line"
          aria-disabled={!more}
          onClick={() => {
            if (!more) return
            scroller.current?.scrollBy({
              left: Math.round((scroller.current?.clientWidth ?? 0) * 0.8),
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            })
          }}
          className="absolute top-1/2 right-1.5 z-10 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-muted text-foreground outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-muted"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

/** Whether the line is wider than its strip, and whether it runs past the right edge from where
 *  it's scrolled to now. Re-measured on scroll and when the strip or the line resizes (a late
 *  font swap widens the line). */
function useMoreToTheRight(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
): { overflows: boolean; more: boolean } {
  const [state, setState] = useState({ overflows: false, more: false })
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const measure = () =>
      setState({
        overflows: el.scrollWidth > el.clientWidth + 1,
        more: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      })
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resize?.observe(el)
    if (el.firstElementChild) resize?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', measure)
      resize?.disconnect()
    }
  }, [ref, enabled])
  return state
}
