/** Copy strings mark code with backticks: "Read `context_window.used_percentage` first." */
export interface InlineCodePart {
  text: string
  code: boolean
  offset: number
}

export function inlineCodeParts(text: string): InlineCodePart[] {
  let offset = 0
  return text
    .split('`')
    .map((part, index) => {
      const entry = { text: part, code: index % 2 === 1, offset }
      offset += part.length + 1
      return entry
    })
    .filter((part) => part.text !== '')
}

export function withoutInlineCode(text: string): string {
  return text.replaceAll('`', '')
}
