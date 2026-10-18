import { dirname, resolve } from 'node:path'
import { defaultBuildLogger, Sandbox, Template, type TemplateClass } from 'e2b'
import { requireEnv } from '@/lib/env'
import { ANTHROPIC_USAGE_CA_PATH, ANTHROPIC_USAGE_HOST } from '@/render/anthropic-usage-mock'
import {
  E2B_TEMPLATE_BUILD_NAME,
  SANDBOX_ANTHROPIC_USAGE_CERT_PATH,
  SANDBOX_ANTHROPIC_USAGE_DIR,
  SANDBOX_ANTHROPIC_USAGE_KEY_PATH,
  SANDBOX_ANTHROPIC_USAGE_SERVER_DEST,
  SANDBOX_ANTHROPIC_USAGE_SERVER_SRC,
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
const JQ_PATH = '/usr/local/bin/jq'

// `copy` resolves its src against the template's file context, which defaults to THIS script's
// directory (scripts/). Anchor it at the repo root so SANDBOX_CLAUDE_SETTINGS_SRC (a repo-relative
// path, shared with its validity test) resolves to the real file.
const REPO_ROOT = resolve(import.meta.dirname, '..')

export const renderTemplate = () =>
  Template({ fileContextPath: REPO_ROOT })
    .fromTemplate('base')
    // Everything except jq comes from apt; jq is the pinned binary installed below.
    // iproute2 provides `ss`, for the hardening check that envd is the only root process listening.
    .aptInstall(['bc', 'gawk', 'bsdextrautils', 'strace', 'openssl', 'ca-certificates', 'iproute2'])
    // Install the pinned, hash-verified jq 1.7.1 into /usr/local/bin (ahead of /usr/bin on PATH).
    // The `&&` chain aborts the build on any failure — a checksum mismatch fails loudly here rather
    // than shipping an unverified binary into the sandbox that runs untrusted scripts.
    .runCmd(
      [
        'test "$(uname -m)" = "x86_64" || { echo "unexpected sandbox arch: $(uname -m)"; exit 1; }',
        `curl -fsSL -o /tmp/jq "${JQ_URL}"`,
        `echo "${JQ_SHA256_AMD64}  /tmp/jq" | sha256sum -c -`,
        `install -m 0755 /tmp/jq ${JQ_PATH}`,
        'rm -f /tmp/jq',
        'jq --version',
      ].join(' && '),
      { user: 'root' },
    )
    // Seed the user's ~/.claude/settings.json. makeDir first so the directory is owned by `user`
    // (a script may also write a cache alongside it); copy the fixture in as a normal user file.
    .makeDir('/home/user/.claude', { user: 'user', mode: 0o755 })
    .copy(SANDBOX_CLAUDE_SETTINGS_SRC, SANDBOX_CLAUDE_SETTINGS_DEST, { user: 'user', mode: 0o644 })
    // Bake a private preview-only HTTPS identity. The CA key exists only during this build command;
    // it is deleted after signing so submitted code can never mint another trusted certificate.
    .makeDir(SANDBOX_ANTHROPIC_USAGE_DIR, { user: 'root', mode: 0o700 })
    .copy(SANDBOX_ANTHROPIC_USAGE_SERVER_SRC, SANDBOX_ANTHROPIC_USAGE_SERVER_DEST, {
      user: 'root',
      mode: 0o500,
    })
    .runCmd(
      [
        'openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 -subj "/CN=statuslines-preview-ca" -keyout /tmp/statuslines-preview-ca.key -out /tmp/statuslines-preview-ca.crt',
        `openssl req -new -newkey rsa:2048 -sha256 -nodes -subj "/CN=${ANTHROPIC_USAGE_HOST}" -addext "subjectAltName=DNS:${ANTHROPIC_USAGE_HOST}" -keyout ${SANDBOX_ANTHROPIC_USAGE_KEY_PATH} -out /tmp/statuslines-anthropic-usage.csr`,
        `openssl x509 -req -sha256 -days 3650 -in /tmp/statuslines-anthropic-usage.csr -CA /tmp/statuslines-preview-ca.crt -CAkey /tmp/statuslines-preview-ca.key -CAcreateserial -copy_extensions copy -out ${SANDBOX_ANTHROPIC_USAGE_CERT_PATH}`,
        `install -o root -g root -m 0644 /tmp/statuslines-preview-ca.crt ${ANTHROPIC_USAGE_CA_PATH}`,
        'update-ca-certificates',
        `chmod 0444 ${ANTHROPIC_USAGE_CA_PATH}`,
        `chmod 0400 ${SANDBOX_ANTHROPIC_USAGE_KEY_PATH}`,
        `chmod 0444 ${SANDBOX_ANTHROPIC_USAGE_CERT_PATH}`,
        `openssl verify -CAfile ${ANTHROPIC_USAGE_CA_PATH} ${SANDBOX_ANTHROPIC_USAGE_CERT_PATH}`,
        `openssl x509 -in ${SANDBOX_ANTHROPIC_USAGE_CERT_PATH} -noout -ext subjectAltName | grep -F "DNS:${ANTHROPIC_USAGE_HOST}"`,
        `test "$(stat -c %a ${SANDBOX_ANTHROPIC_USAGE_KEY_PATH})" = "400"`,
        `test "$(stat -c %a ${ANTHROPIC_USAGE_CA_PATH})" = "444"`,
        `test "$(stat -c %a ${SANDBOX_ANTHROPIC_USAGE_SERVER_DEST})" = "500"`,
        'rm -f /tmp/statuslines-preview-ca.key /tmp/statuslines-preview-ca.crt /tmp/statuslines-preview-ca.srl /tmp/statuslines-anthropic-usage.csr',
      ].join(' && '),
      { user: 'root' },
    )

/** A template's own paths and tooling, held to the snapshot hardening proofs. */
export interface HardeningExtras {
  /** Checked as root for any group- or world-writable file. */
  protectedRoots: readonly string[]
  /** Checked as `user` to exist and not be writable. */
  readOnlyPaths: readonly string[]
  /** Run as `user` after the read-only checks, to prove the template's tooling still runs. */
  userChecks?: readonly string[]
}

const STATUSLINE_HARDENING: HardeningExtras = {
  protectedRoots: ['/opt/statuslines', '/usr/local'],
  readOnlyPaths: [
    JQ_PATH,
    dirname(JQ_PATH),
    ANTHROPIC_USAGE_CA_PATH,
    dirname(ANTHROPIC_USAGE_CA_PATH),
    SANDBOX_ANTHROPIC_USAGE_DIR,
  ],
  userChecks: [`test "$(jq --version)" = "jq-${JQ_VERSION}"`],
}

const EXITS_UNLESS_LOCKED = `awk '{ exit $2 != "L" }'`

/** Fails when `cmd` fails as well as when it prints anything, so a broken probe never passes. */
const printsNothing = (cmd: string) => `out=$(set -o pipefail; ${cmd}) && test -z "$out"`

const ROOT_LISTENERS_OTHER_THAN_ENVD = `ss -Hltunp | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r -n1 ps -o user=,comm= -p | awk '$1 == "root" && $2 != "envd"'`

/**
 * The built sandbox leaves root reachable from `user` (finalize's passwordless sudo, an empty root
 * password beside a setuid `su`, world-writable paths) and runs root sshd and rpcbind. Root removes
 * each whole category on the live sandbox, then the build proves it as root and as `user`, and
 * proves the tooling still runs. Any failing command aborts the build before the snapshot. Every
 * template extends this one, so its own paths are always checked; `extras` add a template's own.
 */
const snapshotHardening = (
  ...extras: HardeningExtras[]
): ReadonlyArray<{ user: 'root' | 'user'; cmd: string }> => {
  const layers = [STATUSLINE_HARDENING, ...extras]
  return [
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
        `find ${layers.flatMap((l) => l.protectedRoots).join(' ')} -perm /022 -not -type l`,
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
      ...layers.flatMap((l) => [
        ...l.readOnlyPaths.map((path) => `test -e ${path} && test ! -w ${path}`),
        ...(l.userChecks ?? []),
      ]),
    ].map((cmd) => ({ user: 'user' as const, cmd })),
  ]
}

export async function hardenSnapshot(
  sandbox: Sandbox,
  ...extras: HardeningExtras[]
): Promise<void> {
  for (const { user, cmd } of snapshotHardening(...extras)) {
    await sandbox.commands.run(cmd, { user })
  }
}

/** What every sandbox started from the snapshot gets. */
export interface SandboxResources {
  cpuCount: number
  memoryMB: number
}

const DEFAULT_RESOURCES: SandboxResources = { cpuCount: 2, memoryMB: 1024 }

/**
 * Builds `template` to the mutable `buildName` alias and prints the immutable snapshot to commit.
 * `harden` runs on the live sandbox before the snapshot, because E2B's build finalize step runs after
 * every template step (it grants `user` passwordless sudo and makes /usr/local world-writable).
 */
export async function buildSnapshot(
  template: TemplateClass,
  buildName: string,
  snapshotConstant: string,
  harden?: (sandbox: Sandbox) => Promise<void>,
  resources: SandboxResources = DEFAULT_RESOURCES,
): Promise<void> {
  const apiKey = requireEnv('E2B_API_KEY')
  const build = await Template.build(template, buildName, {
    apiKey,
    ...resources,
    onBuildLogs: defaultBuildLogger(),
  })

  const sandbox = await Sandbox.create(buildName, { apiKey, timeoutMs: 60_000 })
  let snapshotId: string
  try {
    await harden?.(sandbox)
    const snapshot = await sandbox.createSnapshot({ apiKey })
    snapshotId = snapshot.snapshotId
  } finally {
    await sandbox.kill().catch(() => {})
  }

  console.log(`Built E2B template: ${buildName}`)
  console.log(`Build ID: ${build.buildId}`)
  console.log(`Immutable snapshot ID: ${snapshotId}`)
  console.log(`Commit that snapshot ID as ${snapshotConstant} before deploying.`)
}

export const buildStatuslineSnapshot = () =>
  buildSnapshot(renderTemplate(), E2B_TEMPLATE_BUILD_NAME, 'E2B_TEMPLATE_ID', (sandbox) =>
    hardenSnapshot(sandbox),
  )

if (import.meta.main) {
  await buildStatuslineSnapshot()
  process.exit(0)
}
