import { describe, expect, it } from 'vitest'
import { detectForeignCredentialAccess, readsClaudeToken } from '@/submit/credential-access'

// keyblade's macOS keychain read is a Python LIST — note the `", "` between tokens, not a
// space. This is the regression an earlier `security\s+find-...` regex missed.
const KEYBLADE_SNIPPET = [
  'r = subprocess.run(',
  '    ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],',
  ')',
  'token = creds.get("claudeAiOauth", {}).get("accessToken", "")',
  'with open(os.path.expanduser("~/.claude/credentials.json")) as f:',
  '    creds = json.load(f)',
].join('\n')

// Reading the transcript dir + token COUNTS is extremely common and must NOT trip anything.
const CLEAN_TRANSCRIPT_READER =
  'json=$(cat ~/.claude/projects/**/*.jsonl | tail -1)\n' +
  'tokens_in=$(echo "$json" | jq -r \'.usage.input_tokens // 0\')'

describe('detectForeignCredentialAccess', () => {
  it('allows the keyblade Claude-token reader (no foreign credentials)', () => {
    expect(detectForeignCredentialAccess(KEYBLADE_SNIPPET)).toEqual([])
  })
  it('allows a clean transcript + token-count reader', () => {
    expect(detectForeignCredentialAccess(CLEAN_TRANSCRIPT_READER)).toEqual([])
  })
  it('rejects an SSH private-key read', () => {
    expect(detectForeignCredentialAccess('open(os.path.expanduser("~/.ssh/id_rsa"))')).toHaveLength(
      1,
    )
  })
  it('rejects an ~/.npmrc read', () => {
    expect(detectForeignCredentialAccess('cat ~/.npmrc')).toHaveLength(1)
  })
  it('rejects a non-Claude keychain read', () => {
    expect(
      detectForeignCredentialAccess('security find-generic-password -s "GitHub"'),
    ).toHaveLength(1)
  })

  it('rejects a foreign secret-store read mixed with an allowed Claude token read', () => {
    const mixed = [KEYBLADE_SNIPPET, 'security find-generic-password -s "GitHub" -w'].join('\n')

    expect(detectForeignCredentialAccess(mixed)).toHaveLength(1)
  })

  it('rejects a foreign Keychain target even when Claude appears in the same statement', () => {
    const disguised = 'security find-generic-password -s "GitHub" -w # Claude Code-credentials'

    expect(detectForeignCredentialAccess(disguised)).toHaveLength(1)
  })

  it('rejects an ambiguous Keychain read with duplicate service arguments', () => {
    const duplicate = 'security find-generic-password -s "Claude Code-credentials" -s "GitHub" -w'

    expect(detectForeignCredentialAccess(duplicate)).toHaveLength(1)
  })

  it('rejects a service variable reassigned through a shell declaration prefix', () => {
    const reassigned = [
      'SVC="Claude Code-credentials"',
      'export SVC="GitHub"',
      'security find-generic-password -s "$SVC" -w',
    ].join('\n')

    expect(detectForeignCredentialAccess(reassigned)).toHaveLength(1)
  })

  it('allows an exact Claude service held in a Python constant', () => {
    const pythonConstant = [
      'KEYCHAIN_SERVICE = "Claude Code-credentials"',
      'subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"])',
    ].join('\n')

    expect(detectForeignCredentialAccess(pythonConstant)).toEqual([])
  })

  it('rejects a Python service constant with any unsafe reassignment', () => {
    const reassigned = [
      'KEYCHAIN_SERVICE = "Claude Code-credentials"',
      'KEYCHAIN_SERVICE: str = "GitHub"',
      'subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"])',
    ].join('\n')

    expect(detectForeignCredentialAccess(reassigned)).toHaveLength(1)
  })

  it.each([
    'KEYCHAIN_SERVICE += "-GitHub"',
    'if ready: KEYCHAIN_SERVICE = "GitHub"',
    'KEYCHAIN_SERVICE, other = "GitHub", "x"',
    'def read(KEYCHAIN_SERVICE): pass',
  ])('rejects an unaccounted Python service-variable occurrence: %s', (mutation) => {
    const source = [
      'KEYCHAIN_SERVICE = "Claude Code-credentials"',
      mutation,
      'subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"])',
    ].join('\n')

    expect(detectForeignCredentialAccess(source)).toHaveLength(1)
  })
})

describe('readsClaudeToken', () => {
  it('is true for the keyblade Claude-token reader', () => {
    expect(readsClaudeToken(KEYBLADE_SNIPPET)).toBe(true)
  })
  it('is false for a clean transcript reader (.claude/projects, not credentials)', () => {
    expect(readsClaudeToken(CLEAN_TRANSCRIPT_READER)).toBe(false)
  })
  it('is false for a plain bash+jq statusline', () => {
    expect(readsClaudeToken("jq -r '.model.display_name'")).toBe(false)
  })

  it.each([
    'os.environ["CLAUDE_CODE_OAUTH_TOKEN"]',
    'open(os.path.expanduser("~/.claude/.credentials.json"))',
  ])('recognizes the supported token read %s', (source) => {
    expect(readsClaudeToken(source)).toBe(true)
  })
})
