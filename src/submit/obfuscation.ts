/**
 * Basic obfuscation heuristics for submitted statusline scripts.
 *
 * This is a pre-filter, NOT a security guarantee. Manual review is the real
 * gate. Heuristics are deliberately conservative to avoid false positives on
 * legitimate bash+jq statuslines that use ANSI escapes, command substitution,
 * and moderately long jq filter strings.
 *
 * Returns an array of human-readable reasons; empty array means clean.
 */
export function detectObfuscation(source: string): string[] {
  const reasons: string[] = []

  // 1. Long base64 or hex blob — a continuous run of 200+ chars that look
  //    like encoded data. Real scripts don't have 200-char unbroken runs of
  //    pure base64 or hex alphabet characters.
  const base64Run = /[A-Za-z0-9+/]{200,}={0,2}/
  if (base64Run.test(source)) {
    reasons.push('Long base64-like blob detected (200+ continuous base64 chars)')
  }

  const hexRun = /[0-9a-fA-F]{200,}/
  if (hexRun.test(source)) {
    reasons.push('Long hex-like blob detected (200+ continuous hex chars)')
  }

  // 2. Dynamic eval/exec — eval or exec followed (within the same expression)
  //    by a command substitution, atob, or base64 decode call.
  //    Matches patterns like:
  //      eval "$(... | base64 -d)"
  //      eval(atob('...'))
  //      eval `...`
  //    Anchored tightly enough to avoid flagging the word "eval" in a comment.
  const dynamicEval =
    /\beval\s*[\s("'`$]*(?:[^#\n]*?(?:base64\s+-d|\batob\s*\(|\$\(|`[^`]*`))|\bexec\s*[\s("'`$]*(?:[^#\n]*?(?:base64\s+-d|\batob\s*\(|\$\(|`[^`]*`))/
  if (dynamicEval.test(source)) {
    reasons.push('Dynamic eval/exec of decoded or substituted content detected')
  }

  // 3. Very long single line — any line over 500 characters is suspicious.
  const lines = source.split('\n')
  for (const line of lines) {
    if (line.length > 500) {
      reasons.push(`Very long line detected (${line.length} chars; limit is 500)`)
      break // one reason per category is enough
    }
  }

  // 4. Non-printable characters — chars outside printable ASCII + normal
  //    whitespace (tab U+09, LF U+0a, CR U+0d). ESC (U+1b) is explicitly
  //    excluded because it is legitimately used in ANSI colour codes.
  //    We flag: U+00-U+08 (NUL-BS), U+0b (VT), U+0c (FF),
  //             U+0e-U+1a (SO-SUB), U+1c-U+1f (FS-US), U+7f (DEL).
  //
  //    Built via new RegExp() + String.fromCharCode() to avoid Biome's
  //    noControlCharactersInRegex rule, which rejects both literal control
  //    chars and \xNN escapes inside regex literals.
  const ranges = [
    // NUL (0x00) through BS (0x08)
    `${String.fromCharCode(0x00)}-${String.fromCharCode(0x08)}`,
    // VT (0x0b)
    String.fromCharCode(0x0b),
    // FF (0x0c)
    String.fromCharCode(0x0c),
    // SO (0x0e) through SUB (0x1a) — skips CR (0x0d) and ESC (0x1b)
    `${String.fromCharCode(0x0e)}-${String.fromCharCode(0x1a)}`,
    // FS (0x1c) through US (0x1f)
    `${String.fromCharCode(0x1c)}-${String.fromCharCode(0x1f)}`,
    // DEL (0x7f)
    String.fromCharCode(0x7f),
  ]
  const nonPrintable = new RegExp(`[${ranges.join('')}]`, 'u')
  if (nonPrintable.test(source)) {
    reasons.push('Non-printable control characters detected')
  }

  return reasons
}
