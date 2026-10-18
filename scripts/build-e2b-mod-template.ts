import { dirname } from 'node:path'
import {
  E2B_MOD_TEMPLATE_BUILD_NAME,
  SANDBOX_ANTHROPIC_USAGE_SERVER_SRC,
  SANDBOX_CANNED_MODEL_DIR,
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_CLAUDE_CODE_PREFIX,
  SANDBOX_REPLAY_DIR,
} from '@/render/e2b-template'
import {
  buildSnapshot,
  type HardeningExtras,
  hardenSnapshot,
  renderTemplate,
} from './build-e2b-template'

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

/**
 * sha256 of the native `claude.exe` that Claude Code's postinstall puts behind `bin/claude`, confirmed
 * by two fresh installs of this version on E2B's base image. Update it with the version.
 */
export const CLAUDE_CODE_BINARY_SHA256 =
  '24972e3bc859fab2b46ed4c1e51f7d6130f06d3bd550811a114640de3370d0de'

const MATCHES_CLAUDE_CODE_BINARY_PIN = `echo "${CLAUDE_CODE_BINARY_SHA256}  ${SANDBOX_CLAUDE_CODE_BIN}" | sha256sum -c -`

const RUNS_CLAUDE_CODE_VERSION = `test "$(${SANDBOX_CLAUDE_CODE_BIN} --version | cut -d' ' -f1)" = "${CLAUDE_CODE_VERSION}"`

/** What the mod template adds to the status line template's hardening proofs. */
export const MOD_HARDENING: HardeningExtras = {
  protectedRoots: [],
  readOnlyPaths: [
    SANDBOX_CLAUDE_CODE_BIN,
    dirname(SANDBOX_CLAUDE_CODE_BIN),
    SANDBOX_CANNED_MODEL_SERVER_DEST,
    SANDBOX_CANNED_MODEL_DIR,
    SANDBOX_REPLAY_DIR,
    dirname(SANDBOX_REPLAY_DIR),
    dirname(dirname(SANDBOX_REPLAY_DIR)),
  ],
  userChecks: [
    MATCHES_CLAUDE_CODE_BINARY_PIN,
    RUNS_CLAUDE_CODE_VERSION,
    `cd ${SANDBOX_REPLAY_DIR} && node -e "require('@xterm/headless')"`,
  ],
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
        MATCHES_CLAUDE_CODE_BINARY_PIN,
        `chmod -R go-w ${SANDBOX_CLAUDE_CODE_PREFIX}`,
        `test -z "$(find ${SANDBOX_CLAUDE_CODE_PREFIX} -perm /022 -not -type l)"`,
        RUNS_CLAUDE_CODE_VERSION,
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
    (sandbox) => hardenSnapshot(sandbox, MOD_HARDENING),
  )

if (import.meta.main) {
  await buildModSnapshot()
  process.exit(0)
}
