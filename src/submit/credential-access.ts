/**
 * Credential-access policy for submitted statusline scripts.
 *
 * Reading the Claude Code auth token has a legitimate status-line purpose (plan usage), so we
 * allow it and disclose it with a badge (`readsClaudeToken`). Reading any OTHER credential —
 * SSH keys, AWS, .netrc, .npmrc, gcloud, or a non-Claude secret-store entry — has no legitimate
 * status-line purpose, so `detectForeignCredentialAccess` flags it and submit rejects it, the
 * same way `detectObfuscation` rejects.
 *
 * Pre-filter only — NOT a security guarantee. Human review is the real gate, and the published
 * script runs unsandboxed on the adopter's machine where a regex enforces nothing.
 */

/** The Claude Code auth token specifically — allowed, and badged. */
const CLAUDE_TOKEN =
  /Claude Code-credentials|claudeAiOauth|CLAUDE_CODE_OAUTH_TOKEN|\.claude\/\.credentials(?:\.json)?|\.claude\/credentials|claude-code\/credentials/i

/** Other on-disk credential files — no legitimate status-line use → reject. */
const FOREIGN_CRED_FILE =
  /\bid_rsa\b|\bid_ed25519\b|\bid_ecdsa\b|\bid_dsa\b|\.aws\/credentials|\bnetrc\b|\bnpmrc\b|\.config\/gcloud/i

/** Actual OS secret-store reads (not availability checks or comments that only name a tool). */
const SECRET_STORE =
  /find-(?:generic|internet)-password|\bsecret-tool\s+lookup\b|\bkeyring\.(?:get_password|get_credential)\b/i

/** Exact allowed macOS Keychain target. The first `-s` argument must name Claude's service. */
const CLAUDE_KEYCHAIN_READ =
  /find-(?:generic|internet)-password(?:(?!["']?-s["']?).)*["']?-s["']?\s*,?\s*["']Claude Code-credentials["'](?:\s|,|\]|$)/is
const CLAUDE_KEYCHAIN_VARIABLE_READ =
  /find-(?:generic|internet)-password(?:(?!["']?-s["']?).)*["']?-s["']?\s*,?\s*(?:["']\$([A-Za-z_]\w*)["']|([A-Za-z_]\w*))(?=\s|,|\]|$)/is
const KEYCHAIN_SERVICE_ARG = /(?:^|[\s,])["']?-s["']?(?=$|[\s,])/gi
const CLAUDE_SECRET_TOOL_READ =
  /\bsecret-tool\s+lookup\s+service\s+["']Claude Code-credentials["']/i
const SERVICE_ASSIGNMENT =
  /(?:^|[;\n])\s*(?:(?:local|export|readonly|declare|typeset)(?:\s+-[A-Za-z]+)*\s+)*([A-Za-z_]\w*)(?:\s*:[^=\n]+)?\s*=\s*([^;\n]+)/g
const SAFE_SERVICE_VALUE = /^["']Claude Code-credentials(?:-\$\{[A-Za-z_]\w*\})?["']$/

/** Reasons a submission must be REJECTED because it reads a NON-Claude credential. */
export function detectForeignCredentialAccess(source: string): string[] {
  const reasons: string[] = []
  if (FOREIGN_CRED_FILE.test(source))
    reasons.push('Reads a non-Claude credential file (SSH key, ~/.aws, .netrc, .npmrc, gcloud)')
  // Scope the Claude exemption to one logical invocation: a legitimate read must not hide a
  // second foreign Keychain/libsecret/keyring read elsewhere in the same script.
  const safeServiceVariables = findSafeServiceVariables(source)
  if (
    logicalStatements(source).some((statement) =>
      isForeignSecretStoreStatement(statement, safeServiceVariables),
    )
  )
    reasons.push('Reads a non-Claude secret-store entry (Keychain / libsecret / keyring)')
  return reasons
}

/** Whether the script reads the Claude Code auth token (drives the disclosure badge). */
export function readsClaudeToken(source: string): boolean {
  return CLAUDE_TOKEN.test(source)
}

function isForeignSecretStoreStatement(
  statement: string,
  safeServiceVariables: Set<string>,
): boolean {
  const reads = statement.match(new RegExp(SECRET_STORE.source, 'gi')) ?? []
  if (reads.length === 0) return false
  if (reads.length !== 1) return true
  const readLine = statement.split('\n').find((line) => SECRET_STORE.test(line)) ?? statement
  if (/\bsecret-tool\s+lookup\b/i.test(readLine)) {
    const serviceArgs = readLine.match(/\bservice\b/gi) ?? []
    return serviceArgs.length !== 1 || !CLAUDE_SECRET_TOOL_READ.test(readLine)
  }
  if (/\bkeyring\./i.test(readLine)) return true
  const serviceArgs = readLine.match(KEYCHAIN_SERVICE_ARG) ?? []
  if (serviceArgs.length !== 1) return true
  if (CLAUDE_KEYCHAIN_READ.test(readLine)) return false
  const variableMatch = readLine.match(CLAUDE_KEYCHAIN_VARIABLE_READ)
  const variable = variableMatch?.[1] ?? variableMatch?.[2]
  return !variable || !safeServiceVariables.has(variable)
}

function findSafeServiceVariables(source: string): Set<string> {
  const values = new Map<string, string[]>()
  for (const match of source.matchAll(SERVICE_ASSIGNMENT)) {
    const name = match[1]
    const value = match[2]?.trim()
    if (!name || !value) continue
    values.set(name, [...(values.get(name) ?? []), value])
  }
  return new Set(
    [...values]
      .filter(([name, assigned]) => {
        const occurrences = source.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []
        return (
          assigned.every((value) => SAFE_SERVICE_VALUE.test(value)) &&
          occurrences.length === assigned.length + 1
        )
      })
      .map(([name]) => name),
  )
}

/** Split shell/Python source at top-level newlines/semicolons while preserving multiline calls. */
function logicalStatements(source: string): string[] {
  const statements: string[] = []
  let start = 0
  const scanner = new StatementScanner()

  for (let index = 0; index < source.length; index++) {
    const char = source[index] ?? ''
    if (scanner.accept(char, source[index - 1] ?? '')) {
      statements.push(source.slice(start, index))
      start = index + 1
    }
  }
  statements.push(source.slice(start))
  return statements
}

class StatementScanner {
  private depth = 0
  private quote = ''
  private escaped = false

  accept(char: string, previous: string): boolean {
    if (this.quote) return this.acceptQuoted(char)
    if ('\'"`'.includes(char)) this.quote = char
    else if ('(['.includes(char)) this.depth++
    else if (')]'.includes(char)) this.depth = Math.max(0, this.depth - 1)
    return (char === '\n' || char === ';') && this.depth === 0 && previous !== '\\'
  }

  private acceptQuoted(char: string): false {
    if (this.escaped) this.escaped = false
    else if (char === '\\') this.escaped = true
    else if (char === this.quote) this.quote = ''
    return false
  }
}
