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
/** Generators whose output a reviewer can read, so eval-ing them is not obfuscation. `jq` is the
 *  standard "parse JSON stdin into shell vars" idiom (`jq … @sh`, often spanning several lines, so
 *  we match `jq` on the eval line rather than requiring `@sh` on it); ssh-agent / direnv emit fixed,
 *  well-known shell. A decode/fetch marker still forces a flag even on a jq line (see caller), so
 *  `eval "$(curl … | jq …)"` is caught. */
const SAFE_EVAL_GENERATOR = /\bjq\b|\bssh-agent\b|\bdirenv\s+hook\b/
/** Decode/fetch markers that hide code; force a flag even on an otherwise-whitelisted line.
 *  Case-insensitive so `base64 -D` (BSD) is caught alongside `base64 -d`. */
const DECODE_OR_FETCH =
  /base64\s+-{1,2}d|--decode|\batob\s*\(|\bxxd\b|\bopenssl\b|\bcurl\b|\bwget\b|\bgpg\b|\buudecode\b/i

/**
 * True when a single line runs eval/exec over dynamically-generated content that is NOT a
 * whitelisted safe generator — i.e. the eval'd code is hidden from a reviewer (decoded, fetched,
 * printf-hex, tr/rev, an interpreter `-c`/`-e`, etc.). Default-flag with a narrow allow-list, so an
 * unrecognized generator fails safe. A decode/fetch marker forces a flag even on a "safe" line
 * (e.g. `eval "$(curl … | jq @sh)"`). Pre-filter only — sandbox + human review are the real gate.
 */
function evalRunsHiddenCode(line: string): boolean {
  // Drop comment lines and trailing ` #…` comments so a marker named in prose isn't matched. A `#`
  // with no preceding whitespace (e.g. the `${_#}` no-op expansion) is NOT a comment and is kept,
  // so that comment-trick can't hide a `$(curl …)` from the check.
  const code = line.replace(/^\s*#.*$/, '').replace(/\s#.*$/, '')
  const generated = /\$\(|`|\bbase64\b|\batob\s*\(/.test(code)
  if (!generated) return false
  return DECODE_OR_FETCH.test(code) || !SAFE_EVAL_GENERATOR.test(code)
}

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

  // 2. Dynamic eval/exec of HIDDEN code. Default-flag any eval/exec of dynamically-generated
  //    content, whitelisting only the few generators whose output a reviewer can plainly read
  //    (jq @sh, ssh-agent, direnv). See evalRunsHiddenCode. Per-line so a long source stays linear.
  const evalLines = source.match(/^.*\b(?:eval|exec)\b.*$/gm) ?? []
  if (evalLines.some(evalRunsHiddenCode)) {
    reasons.push('Dynamic eval/exec of decoded, fetched, or otherwise hidden content detected')
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
