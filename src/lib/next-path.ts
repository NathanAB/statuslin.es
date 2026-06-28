/**
 * Guards the `?next=` return-to-origin param against open redirects.
 *
 * Returns `value` only when it is a same-origin absolute path: a string that
 * starts with exactly one `/`, with no backslashes and no whitespace/control
 * characters. Everything else (protocol-relative `//evil.com`, `https://…`,
 * empty, non-strings) collapses to `'/'`.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  // Must start with a single slash (reject '//evil.com' and 'https://…').
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  // No backslashes (some parsers treat '\' as '/').
  if (value.includes('\\')) return '/'
  // No whitespace or ASCII control characters (0x00-0x1f, DEL).
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control chars is the point
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return '/'
  return value
}
