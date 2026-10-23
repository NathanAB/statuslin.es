/**
 * Text runs the full width of its column. The owner has asked more than once for no line-length
 * caps, and one came back as a grid span (PageHeader's lead on eight of twelve columns), so this
 * catches both kinds: a class string that sets text and also caps its width with `max-w-*` or a
 * `col-span-1` … `col-span-11`, and a measure anywhere: a width in `ch`, a max width in `ch` or
 * `em`, or `max-w-prose` (an `em` width alone sizes a glyph, like the terminal's cursor). It reads one
 * string literal at a time, so a cap passed to `cn()` in a separate string from the text classes
 * gets past it; keep a text element's classes in one string.
 */

/** Files whose cap isn't on page text, and why. */
const ALLOW: Record<string, string> = {
  'src/ui/tooltip.tsx': 'a tooltip floats over the page and needs a width, or it spans the screen',
}

const STRING_LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g
const TEXT_CLASS =
  /(?:^|:)text-(?:xs|sm|base|lg|xl|[2-9]xl|small|body|lead|heading|display|pretty|balance|center|left|right|start)$/
const WIDTH_CAP = /(?:^|:)(?:max-w-(?!full$|none$|page$)\S+|col-span-(?:[1-9]|1[01]))$/
const MEASURE = /(?:^|:)(?:max-w-prose|max-w-\[[\d.]+(?:ch|em)\]|w-\[[\d.]+ch\])$/

export function findTextWidthCaps(path: string, content: string): string[] {
  if (path in ALLOW) return []
  const out: string[] = []
  for (const literal of content.match(STRING_LITERAL) ?? []) {
    const classes = literal.slice(1, -1).split(/\s+/)
    const capped =
      classes.some((c) => MEASURE.test(c)) ||
      (classes.some((c) => TEXT_CLASS.test(c)) && classes.some((c) => WIDTH_CAP.test(c)))
    if (capped)
      out.push(
        `${path}: ${literal} caps the width of text. Let it run the full width of its column (no max-w, col-span under 12 or ch measure on text)`,
      )
  }
  return out
}
