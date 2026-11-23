/** How llms.txt and llms-full.txt make author-written text safe to print as one line of Markdown. */

const MAX_SUMMARY_CHARS = 160

/** Text an author wrote, or copy written from their script: one line, with no live link syntax. */
export function untrusted(text: string): string {
  return escapeMarkdownLinks(flat(text))
}

/** Authors write titles and descriptions, so a `](` or `<url>` in them must not forge a link. */
export function escapeMarkdownLinks(text: string): string {
  return text.replace(/[\\[\]<>]/g, (c) => `\\${c}`)
}

export function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function oneLine(text: string): string {
  const line = flat(text)
  if (line.length <= MAX_SUMMARY_CHARS)
    return line === '' || /[.!?]$/.test(line) ? line : `${line}.`
  const cut = line.slice(0, MAX_SUMMARY_CHARS - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}
