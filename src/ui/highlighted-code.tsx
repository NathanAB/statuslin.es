import { Copyable } from '@/ui/copy-button'

/**
 * Renders Shiki's server-generated, syntax-highlighted source HTML. Safe to inject: Shiki escapes
 * the code text (see src/lib/highlight.ts), so the string is markup we produced, not user markup.
 * Appearance lives in the `.shiki` rule in src/styles/app.css. Pass `text` to overlay the shared
 * copy control (the highlighted HTML is display-only; `text` is what actually hits the clipboard).
 */
export function HighlightedCode({
  html,
  text,
  copyLabel,
  onCopied,
}: {
  html: string
  text?: string | undefined
  copyLabel?: string | undefined
  onCopied?: (() => void) | undefined
}) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated, Shiki-escaped HTML.
  const well = <div dangerouslySetInnerHTML={{ __html: html }} />
  return (
    <Copyable text={text} copyLabel={copyLabel} onCopied={onCopied}>
      {well}
    </Copyable>
  )
}
