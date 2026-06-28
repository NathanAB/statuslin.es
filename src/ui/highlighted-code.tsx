/**
 * Renders Shiki's server-generated, syntax-highlighted source HTML. Safe to inject: Shiki escapes
 * the code text (see src/lib/highlight.ts), so the string is markup we produced, not user markup.
 * Appearance lives in the `.shiki` rule in src/styles/app.css.
 */
export function HighlightedCode({ html }: { html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated, Shiki-escaped HTML.
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
