import { resolve } from 'node:path'
import { defaultBuildLogger, Template } from 'e2b'
import { requireEnv } from '@/lib/env'
import {
  E2B_TEMPLATE_NAME,
  SANDBOX_CLAUDE_SETTINGS_DEST,
  SANDBOX_CLAUDE_SETTINGS_SRC,
} from '@/render/e2b-template'

/**
 * Builds the custom E2B sandbox template used to render untrusted statusline scripts.
 *
 * The E2B base image is Debian 12 with bash, node 20, python3, git, curl, sed/grep/awk, etc.,
 * but it is MISSING the tools real statuslines depend on. The render sandbox runs with the
 * network off, so we can't apt-get at runtime — everything must be baked in here.
 *
 * Installed:
 *   jq 1.7.1      — parse the stdin JSON; the #1 statusline dependency. Pinned to the official
 *                   1.7.1 release binary (hash-verified) instead of Debian's apt jq 1.6, because
 *                   1.6 has a guard-defeating bug: `echo "" | jq -e .` exits 0 on 1.6 but 4 on
 *                   1.7+, so a script's "settings.json missing → fall back to {}" guard silently
 *                   fails on 1.6 and a later `jq --argjson cfg ""` aborts with empty output,
 *                   rendering the whole statusline blank. 1.7.1 is also the modern baseline.
 *   bc            — arithmetic (context %, cost math); the other dep the generated scripts use.
 *   gawk          — full awk; the base ships only basic awk (mawk), which lacks gawk features.
 *   bsdextrautils — provides `column`, used by some statuslines to align output.
 *   strace        — NOT a statusline dep; it's for our behavior trace (Slice 6 runs it as root
 *                   with a write-protected sink). Baked in now so that wiring has it available.
 *
 * Seeded:
 *   ~/.claude/settings.json — a real Claude Code install always has this file and many statuslines
 *                   read config out of it. The sandbox's home is empty, so we seed a comprehensive,
 *                   valid settings file (src/render/sandbox-claude-settings.json) so those scripts
 *                   find what they expect instead of nothing. See SANDBOX_CLAUDE_SETTINGS_SRC.
 *
 * Build from base 'base' so node/python/git stay present; we only add the missing tools.
 *
 * Run:  bun run build:e2b-template
 */

// jq is pinned to the official release binary and verified by hash (the project's supply-chain
// rule: immutable, hash-pinned versions). Checksum is from the release's sha256sum.txt, confirmed
// by downloading jq-linux-amd64 and recomputing it. Update both together on a version bump.
const JQ_VERSION = '1.7.1'
const JQ_SHA256_AMD64 = '5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5'
const JQ_URL = `https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-amd64`

// `copy` resolves its src against the template's file context, which defaults to THIS script's
// directory (scripts/). Anchor it at the repo root so SANDBOX_CLAUDE_SETTINGS_SRC (a repo-relative
// path, shared with its validity test) resolves to the real file.
const REPO_ROOT = resolve(import.meta.dirname, '..')

const template = Template({ fileContextPath: REPO_ROOT })
  .fromTemplate('base')
  // Everything except jq comes from apt; jq is the pinned binary installed below.
  .aptInstall(['bc', 'gawk', 'bsdextrautils', 'strace'])
  // Install the pinned, hash-verified jq 1.7.1 into /usr/local/bin (ahead of /usr/bin on PATH).
  // The `&&` chain aborts the build on any failure — a checksum mismatch fails loudly here rather
  // than shipping an unverified binary into the sandbox that runs untrusted scripts.
  .runCmd(
    [
      'test "$(uname -m)" = "x86_64" || { echo "unexpected sandbox arch: $(uname -m)"; exit 1; }',
      `curl -fsSL -o /tmp/jq "${JQ_URL}"`,
      `echo "${JQ_SHA256_AMD64}  /tmp/jq" | sha256sum -c -`,
      'install -m 0755 /tmp/jq /usr/local/bin/jq',
      'rm -f /tmp/jq',
      'jq --version',
    ].join(' && '),
    { user: 'root' },
  )
  // Seed the user's ~/.claude/settings.json. makeDir first so the directory is owned by `user`
  // (a script may also write a cache alongside it); copy the fixture in as a normal user file.
  .makeDir('/home/user/.claude', { user: 'user', mode: 0o755 })
  .copy(SANDBOX_CLAUDE_SETTINGS_SRC, SANDBOX_CLAUDE_SETTINGS_DEST, { user: 'user', mode: 0o644 })

await Template.build(template, E2B_TEMPLATE_NAME, {
  apiKey: requireEnv('E2B_API_KEY'),
  cpuCount: 2,
  memoryMB: 1024,
  onBuildLogs: defaultBuildLogger(),
})

console.log(`Built E2B template: ${E2B_TEMPLATE_NAME}`)
process.exit(0)
