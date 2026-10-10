import { dirname } from 'node:path'
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

/**
 * sha256 of the native `claude.exe` that Claude Code's postinstall puts behind `bin/claude`, confirmed
 * by two fresh installs of this version on E2B's base image. Update it with the version.
 */
export const CLAUDE_CODE_BINARY_SHA256 =
  '24972e3bc859fab2b46ed4c1e51f7d6130f06d3bd550811a114640de3370d0de'

const PROTECTED_ROOTS = `/opt/statuslines /usr/local`

const EXITS_UNLESS_LOCKED = `awk '{ exit $2 != "L" }'`

/** Fails when `cmd` fails as well as when it prints anything, so a broken probe never passes. */
const printsNothing = (cmd: string) => `out=$(set -o pipefail; ${cmd}) && test -z "$out"`

const ROOT_LISTENERS_OTHER_THAN_ENVD = `ss -Hltunp | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r -n1 ps -o user=,comm= -p | awk '$1 == "root" && $2 != "envd"'`

const MATCHES_CLAUDE_CODE_BINARY_PIN = `echo "${CLAUDE_CODE_BINARY_SHA256}  ${SANDBOX_CLAUDE_CODE_BIN}" | sha256sum -c -`

const RUNS_CLAUDE_CODE_VERSION = `test "$(${SANDBOX_CLAUDE_CODE_BIN} --version | cut -d' ' -f1)" = "${CLAUDE_CODE_VERSION}"`

/** Paths a template adds beyond the mod template's, held to the same hardening proofs. */
export interface HardeningExtras {
  /** Checked as root for any group- or world-writable file. */
  protectedRoots: readonly string[]
  /** Checked as `user` to exist and not be writable. */
  readOnlyPaths: readonly string[]
}

const NO_EXTRAS: HardeningExtras = { protectedRoots: [], readOnlyPaths: [] }

/**
 * The built sandbox leaves root reachable from `user` (finalize's passwordless sudo, an empty root
 * password beside a setuid `su`, world-writable paths) and runs root sshd and rpcbind. Root removes
 * each whole category on the live sandbox, then the build proves it as root and as `user`, and
 * proves the tooling still runs. Any failing command aborts the build before the snapshot.
 */
export const snapshotHardening = (
  extras: HardeningExtras = NO_EXTRAS,
): ReadonlyArray<{ user: 'root' | 'user'; cmd: string }> => [
  ...[
    "sed -i '/^user ALL=/d' /etc/sudoers",
    'rm -rf /etc/sudoers.d/*',
    'gpasswd -d user sudo',
    'chmod -R go-w /usr/local',
    'find / -xdev -perm /6000 -type f -exec chmod ug-s {} +',
    'passwd -l root',
    'passwd -l user',
    'systemctl mask --now ssh.service ssh.socket rpcbind.service rpcbind.socket',
    // The base image ships these 0777; the world-writable checks below reject them.
    'chmod go-w /etc/inittab /code',
    // Unprivileged user namespaces are a kernel-exploit surface, and nothing here needs them.
    'sysctl -w user.max_user_namespaces=0',
    // As root, because `user` cannot list the root-only usage server directory.
    printsNothing(
      `find ${[PROTECTED_ROOTS, ...extras.protectedRoots].join(' ')} -perm /022 -not -type l`,
    ),
    printsNothing('find / -xdev -perm /6000 -type f'),
    printsNothing(
      'find / -xdev -perm -0002 ! -type l ! -type d ! -path "/tmp/*" ! -path "/proc/*"',
    ),
    printsNothing(
      'find / -xdev -type d -perm -0002 ! -perm -1000 ! -path "/tmp/*" ! -path "/var/tmp/*"',
    ),
    'test "$(cat /proc/sys/user/max_user_namespaces)" = 0',
    `passwd -S root | ${EXITS_UNLESS_LOCKED}`,
    `passwd -S user | ${EXITS_UNLESS_LOCKED}`,
    printsNothing(ROOT_LISTENERS_OTHER_THAN_ENVD),
  ].map((cmd) => ({ user: 'root' as const, cmd })),
  ...[
    '! echo | timeout 5 su -c true root',
    '! sudo -n true',
    'test -x /usr/bin/unshare && ! unshare -Ur true',
    MATCHES_CLAUDE_CODE_BINARY_PIN,
    ...[
      SANDBOX_CLAUDE_CODE_BIN,
      dirname(SANDBOX_CLAUDE_CODE_BIN),
      SANDBOX_CANNED_MODEL_SERVER_DEST,
      SANDBOX_CANNED_MODEL_DIR,
      SANDBOX_REPLAY_DIR,
      dirname(SANDBOX_REPLAY_DIR),
      dirname(dirname(SANDBOX_REPLAY_DIR)),
      ...extras.readOnlyPaths,
    ].map((path) => `test -e ${path} && test ! -w ${path}`),
    RUNS_CLAUDE_CODE_VERSION,
    `cd ${SANDBOX_REPLAY_DIR} && node -e "require('@xterm/headless')"`,
  ].map((cmd) => ({ user: 'user' as const, cmd })),
]

export async function hardenSnapshot(
  sandbox: Sandbox,
  extras: HardeningExtras = NO_EXTRAS,
): Promise<void> {
  for (const { user, cmd } of snapshotHardening(extras)) {
    await sandbox.commands.run(cmd, { user })
  }
}

const verifyIntegrity = ({ name, version, integrity }: (typeof MOD_TEMPLATE_PACKAGES)[number]) =>
  `test "$(npm view ${name}@${version} dist.integrity)" = "${integrity}"`

export const modRenderTemplate = () =>
  renderTemplate()
    // `ss`, for the build's check that envd is the only root process listening on a port.
    .aptInstall(['iproute2'])
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
    (sandbox) => hardenSnapshot(sandbox),
  )

if (import.meta.main) {
  await buildModSnapshot()
  process.exit(0)
}
