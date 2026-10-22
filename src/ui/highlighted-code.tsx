import { ChevronDown } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Copyable } from '@/ui/copy-button'
import { Row, Stack } from '@/ui/layout'

/** The longest script shown whole; a longer one folds to its first 12 lines. */
const WHOLE_UP_TO = 20

/** Lines as an editor counts them: a final newline doesn't start another. */
const lineCount = (text: string) => text.replace(/\n$/, '').split('\n').length

/**
 * Renders Shiki's server-generated, syntax-highlighted source HTML. Safe to inject: Shiki escapes
 * the code text (see src/lib/highlight.ts), so the string is markup we produced, not user markup.
 * Appearance lives in the `.shiki` rule in src/styles/app.css. Pass `text` to overlay the shared
 * copy control (the highlighted HTML is display-only; `text` is what actually hits the clipboard).
 * `peek` folds a script longer than WHOLE_UP_TO lines to its first 12 under a fade, with a button
 * under it that grows it open; the whole script stays in the page, and copy still takes all of it.
 */
export function HighlightedCode({
  html,
  text,
  copyLabel,
  onCopied,
  peek = false,
}: {
  html: string
  text?: string | undefined
  copyLabel?: string | undefined
  onCopied?: (() => void) | undefined
  peek?: boolean | undefined
}) {
  const [open, setOpen] = useState(false)
  const wellId = useId()
  const well = useRef<HTMLDivElement>(null)
  const lines = text === undefined ? 0 : lineCount(text)
  const folded = peek && lines > WHOLE_UP_TO && !open
  const code = (
    <Copyable text={text} copyLabel={copyLabel} onCopied={onCopied}>
      <div
        ref={well}
        id={wellId}
        // Focus lands here when the button that opened it goes away.
        tabIndex={peek ? -1 : undefined}
        className={cn(
          peek &&
            'relative overflow-hidden rounded-md text-sm outline-none [interpolate-size:allow-keywords] motion-safe:transition-[height] motion-safe:duration-500 motion-safe:ease-settle',
          // 12 lines of the `.shiki` well's text-sm, plus its top padding.
          folded && 'h-[calc(12lh+1rem)]',
        )}
      >
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated, Shiki-escaped HTML. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {folded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-b from-transparent to-sunken" />
        ) : null}
      </div>
    </Copyable>
  )
  if (!peek) return code
  // The same button as a long gallery list's: it leaves once clicked, and focus moves to the code,
  // which stays mounted so it can take it.
  return (
    <Stack gap={6}>
      {code}
      {folded ? (
        <Row gap={3} justify="center">
          <Button asChild variant="secondary" size="pill" trailingIcon={<ChevronDown />}>
            <button
              type="button"
              aria-expanded={false}
              aria-controls={wellId}
              onClick={() => {
                setOpen(true)
                well.current?.focus({ preventScroll: true })
              }}
            >
              Show all {lines} lines
            </button>
          </Button>
        </Row>
      ) : null}
    </Stack>
  )
}
