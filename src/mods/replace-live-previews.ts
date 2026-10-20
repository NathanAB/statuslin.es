/** The one question render:mods asks about every live mod whose new previews it holds. */
export function replaceQuestion(slugs: string[]): string {
  const mods = slugs.length === 1 ? 'this mod' : `these ${slugs.length} mods`
  return `Replace the live previews of ${mods}: ${slugs.join(', ')}? [y = all, n = none, or the slugs to leave out]`
}

/**
 * The slugs to replace, in `slugs` order. An answer that names a slug not in `slugs` replaces none,
 * so a typo never approves a mod the operator meant to leave out.
 */
export function parseReplaceAnswer(
  answer: string,
  slugs: string[],
): { replace: string[] } | { unknown: string[] } {
  const trimmed = answer.trim()
  if (/^y(es)?$/i.test(trimmed)) return { replace: slugs }
  if (trimmed === '' || /^no?$/i.test(trimmed)) return { replace: [] }
  const leftOut = trimmed.split(/[\s,]+/)
  const unknown = leftOut.filter((slug) => !slugs.includes(slug))
  if (unknown.length > 0) return { unknown }
  return { replace: slugs.filter((slug) => !leftOut.includes(slug)) }
}
