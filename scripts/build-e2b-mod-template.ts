import type { Sandbox } from 'e2b'
import {
  E2B_MOD_TEMPLATE_BUILD_NAME,
  SANDBOX_ANTHROPIC_USAGE_SERVER_SRC,
  SANDBOX_CANNED_MODEL_DIR,
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_CLAUDE_CODE_PREFIX,
  SANDBOX_REPLAY_DIR,
} from '@/render/e2b-template'
import { buildSnapshot, renderTemplate } from './build-e2b-template'

/**
 * Builds the E2B template that renders mods: the status line template plus Claude Code, a headless
 * terminal for replaying recordings, and the canned model server runnable as `user`.
 *
 * Claude Code is installed from npm at an exact version at build time and never modified after
 * (the hosted-sandbox conditions in the mods epic, #37). On the base image's Node 20, npm warns
 * EBADENGINE (Claude Code declares node >=22); the spike (#38) measured the binary running anyway.
 *
 * Run:  bun run build:e2b-mod-template
 */

const CLAUDE_CODE_VERSION = '2.1.296'
const XTERM_HEADLESS_VERSION = '6.0.0'

/**
 * Registry integrity for every package the template installs, confirmed with
 * `npm view <name>@<version> dist.integrity`. The build refuses to install unless the registry
 * still reports these values; npm then checks each tarball against the integrity it fetches. The
 * Linux x64 package carries the native binary and arrives as an exact-version optional dependency
 * of Claude Code. Update these with the versions.
 */
export const MOD_TEMPLATE_PACKAGES = [
  {
    name: '@anthropic-ai/claude-code',
    version: CLAUDE_CODE_VERSION,
    integrity:
      'sha512-OX/k/rpcthMqnFKOWcpNcbiLsMKtAjLOpQNJHlYiDCFUznWCIwdRTyl/p9SdHVrsrzZuPMCNqZjnpakIni6upw==',
  },
  {
    name: '@anthropic-ai/claude-code-linux-x64',
    version: CLAUDE_CODE_VERSION,
    integrity:
      'sha512-+m01urgelnI+VJxPaKPEK0wixgq42uZ8PeCaUk5tX/8YoDBvSmC/REVQG2jQfJAr8dxunpjJ600FvLrcj1WWTw==',
  },
  {
    name: '@xterm/headless',
    version: XTERM_HEADLESS_VERSION,
    integrity:
      'sha512-5Yj1QINYCyzrZtf8OFIHi47iQtI+0qYFPHmouEfG8dHNxbZ9Tb9YGSuLcsEwj9Z+OL75GJqPyJbyoFer80a2Hw==',
  },
] as const

const PROTECTED_ROOTS = `/opt/statuslines /usr/local`

/** Root first strips what finalize granted, then `user` proves it can no longer escalate or write. */
const SNAPSHOT_HARDENING: ReadonlyArray<{ user: 'root' | 'user'; cmd: string }> = [
  {
    user: 'root',
    cmd: [
      "sed -i '/^user ALL=/d' /etc/sudoers",
      'rm -rf /etc/sudoers.d/*',
      'gpasswd -d user sudo',
      'chmod -R go-w /usr/local',
      // As root, because `user` cannot list the root-only usage server directory.
      `test -z "$(find ${PROTECTED_ROOTS} -perm /022 -not -type l)"`,
    ].join(' && '),
  },
  { user: 'user', cmd: '! sudo -n true' },
  ...[SANDBOX_CLAUDE_CODE_BIN, SANDBOX_CANNED_MODEL_SERVER_DEST, SANDBOX_REPLAY_DIR].map(
    (path) => ({ user: 'user' as const, cmd: `test ! -w ${path}` }),
  ),
]

async function hardenSnapshot(sandbox: Sandbox): Promise<void> {
  for (const { user, cmd } of SNAPSHOT_HARDENING) {
    await sandbox.commands.run(cmd, { user })
  }
}

const verifyIntegrity = ({ name, version, integrity }: (typeof MOD_TEMPLATE_PACKAGES)[number]) =>
  `test "$(npm view ${name}@${version} dist.integrity)" = "${integrity}"`

export const modRenderTemplate = () =>
  renderTemplate()
    .runCmd(MOD_TEMPLATE_PACKAGES.map(verifyIntegrity).join(' && '))
    // A root-owned prefix under /opt, because E2B's build finalize makes /usr/local world-writable.
    .runCmd(
      [
        `npm install -g --prefix ${SANDBOX_CLAUDE_CODE_PREFIX} --no-fund --no-audit @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`,
        `chmod -R go-w ${SANDBOX_CLAUDE_CODE_PREFIX}`,
        `test -z "$(find ${SANDBOX_CLAUDE_CODE_PREFIX} -perm /022 -not -type l)"`,
        `test "$(${SANDBOX_CLAUDE_CODE_BIN} --version | cut -d' ' -f1)" = "${CLAUDE_CODE_VERSION}"`,
      ].join(' && '),
      { user: 'root' },
    )
    .runCmd(
      [
        `mkdir -p ${SANDBOX_REPLAY_DIR}`,
        `cd ${SANDBOX_REPLAY_DIR}`,
        'npm init -y >/dev/null',
        `npm install --no-fund --no-audit @xterm/headless@${XTERM_HEADLESS_VERSION}`,
        `chmod -R a+rX,go-w ${SANDBOX_REPLAY_DIR}`,
      ].join(' && '),
      { user: 'root' },
    )
    .makeDir(SANDBOX_CANNED_MODEL_DIR, { user: 'root', mode: 0o755 })
    .copy(SANDBOX_ANTHROPIC_USAGE_SERVER_SRC, SANDBOX_CANNED_MODEL_SERVER_DEST, {
      user: 'root',
      mode: 0o555,
    })

export const buildModSnapshot = () =>
  buildSnapshot(
    modRenderTemplate(),
    E2B_MOD_TEMPLATE_BUILD_NAME,
    'E2B_MOD_TEMPLATE_ID',
    hardenSnapshot,
  )

if (import.meta.main) {
  await buildModSnapshot()
  process.exit(0)
}
