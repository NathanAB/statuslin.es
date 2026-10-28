import { withoutInlineCode } from '@/lib/inline-code'

/**
 * What a listing's search snippet and share card say: its reviewed page summary, written for a
 * reader, or the author's description until it has one. The summary marks code with backticks for
 * the page, so they're dropped here: snippets show plain text.
 */
export function searchDescription(
  description: string,
  copy: { summary: string } | null | undefined,
): string {
  return copy ? withoutInlineCode(copy.summary) : description
}
