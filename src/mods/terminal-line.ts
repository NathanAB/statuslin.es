/** Control and format characters, and line and paragraph separators: none may reach a terminal. */
export const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u
const UNPRINTABLE = new RegExp(`\\\\|${CONTROL_OR_FORMAT.source}`, 'gu')

function escapeCode(char: string): string {
  const code = char.codePointAt(0) ?? 0
  return code > 0xffff ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, '0')}`
}

/**
 * Filenames, plugin.json fields, the footprint and tool errors come from a mod's repository, so an
 * author controls them. Escaping control and format characters keeps a newline or ANSI escape in
 * one from forging or erasing the lines the operator reads; escaping the backslash keeps an author
 * from typing a fake escape. Astral escapes are braced so a following digit stays outside the code.
 */
export function printable(line: string): string {
  return line.replace(UNPRINTABLE, escapeCode)
}

const MAX_LINE_CHARS = 500

/**
 * Every line the mod scripts print goes through here: escaped (an ESC or OSC 52 sequence could
 * rewrite the log or the operator's clipboard) and capped, without cutting an escape in half.
 */
export function terminalLine(line: string): string {
  const escaped = printable(line)
  if (escaped.length <= MAX_LINE_CHARS) return escaped
  const suffix = (rest: number) => `… (${rest} more characters)`
  const head = escaped
    .slice(0, MAX_LINE_CHARS - suffix(escaped.length).length)
    .replace(/\\(u(\{[0-9a-f]*|[0-9a-f]{0,3}))?$/, '')
  return `${head}${suffix(escaped.length - head.length)}`
}
