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
  /Claude Code-credentials|claudeAiOauth|\.claude\/credentials|claude-code\/credentials/i

/** Other on-disk credential files — no legitimate status-line use → reject. */
const FOREIGN_CRED_FILE =
  /\bid_rsa\b|\bid_ed25519\b|\bid_ecdsa\b|\bid_dsa\b|\.aws\/credentials|\bnetrc\b|\bnpmrc\b|\.config\/gcloud/i

/** Any OS secret-store read (macOS Keychain / libsecret / Python keyring). */
const SECRET_STORE = /find-(?:generic|internet)-password|\bsecret-tool\b|\bkeyring\b/i

/** Reasons a submission must be REJECTED because it reads a NON-Claude credential. */
export function detectForeignCredentialAccess(source: string): string[] {
  const reasons: string[] = []
  if (FOREIGN_CRED_FILE.test(source))
    reasons.push('Reads a non-Claude credential file (SSH key, ~/.aws, .netrc, .npmrc, gcloud)')
  // A secret-store read is foreign UNLESS it targets the Claude Code keychain service.
  if (SECRET_STORE.test(source) && !/Claude Code-credentials/.test(source))
    reasons.push('Reads a non-Claude secret-store entry (Keychain / libsecret / keyring)')
  return reasons
}

/** Whether the script reads the Claude Code auth token (drives the disclosure badge). */
export function readsClaudeToken(source: string): boolean {
  return CLAUDE_TOKEN.test(source)
}
