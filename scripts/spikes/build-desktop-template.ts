/**
 * SPIKE (throwaway, never merged): builds the `statuslines-desktop-spike` E2B template, the mods
 * template plus the real Claude Desktop for Linux on a virtual display.
 *
 * - claude-desktop is the pinned `.deb` from Anthropic's apt pool, checked against the sha256 the
 *   repository index lists.
 * - Desktop downloads its Claude Code engine on first use. Its "offline installer" path instead
 *   installs `resources/preseed/claude-code/<platform>.zst` when that file's sha256 matches the
 *   engine pin compiled into the app, so the build fetches that exact file from downloads.claude.ai
 *   and checks the same sha256.
 *
 *   bun scripts/spikes/build-desktop-template.ts [--snapshot]
 *
 * The template id is printed, never written to source.
 */
import { defaultBuildLogger, Sandbox, Template } from 'e2b'
import { modRenderTemplate } from '../build-e2b-mod-template'
import { stagingE2bKey } from './e2b-shell'

export const DESKTOP_TEMPLATE_NAME = 'statuslines-desktop-spike'
export const DESKTOP_VERSION = '2.31226.1'
const DESKTOP_DEB_SHA256 = '5a9bebdfcb1df6ce38767b373f3a7fabf77156a2ddd8a3f5d04961da5bde305e'
const DESKTOP_DEB_URL = `https://downloads.claude.ai/claude-desktop/apt/stable/pool/main/c/claude-desktop/claude-desktop_${DESKTOP_VERSION}_amd64.deb`
/** The engine pin compiled into Desktop 2.31226.1 (`sg()` in index.chunk-BsJ4Sf2W.js). */
export const ENGINE_VERSION = '2.1.295'
const ENGINE_ZST_SHA256 = '71164c85f9d226928dec7acda1baf000f1991eb14fcec106536d84bd914032f8'
const ENGINE_URL = `https://downloads.claude.ai/claude-code-releases/${ENGINE_VERSION}/linux-x64/claude.zst`
const PRESEED_DIR = '/usr/lib/claude-desktop/resources/preseed/claude-code'

const ASSETS = 'scripts/spikes/desktop-assets'
export const DESKTOP_DIR = '/opt/statuslines/desktop'
export const DESKTOP_BOOT = `${DESKTOP_DIR}/boot.sh`
const KEYRING_DIR = '/home/user/.local/share/keyrings'

const X_PACKAGES = [
  'xvfb',
  'xdotool',
  'imagemagick',
  'x11-utils',
  'dbus-x11',
  'gnome-keyring',
  'libsecret-tools',
  'fonts-dejavu-core',
  'fonts-liberation',
  'fonts-noto-core',
  'fonts-noto-color-emoji',
]

export const desktopTemplate = () =>
  modRenderTemplate()
    .runCmd(
      [
        'set -e',
        'cd /tmp',
        `curl -fsSLo claude-desktop.deb ${DESKTOP_DEB_URL}`,
        `echo "${DESKTOP_DEB_SHA256}  claude-desktop.deb" | sha256sum -c -`,
        'echo CLAUDE_DESKTOP_ADD_REPO=\\"false\\" > /etc/default/claude-desktop',
        'apt-get update -qq',
        `DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ./claude-desktop.deb ${X_PACKAGES.join(' ')}`,
        'rm -f claude-desktop.deb',
        `test "$(dpkg-query -W -f='\${Version}' claude-desktop)" = "${DESKTOP_VERSION}"`,
        `mkdir -p ${PRESEED_DIR}`,
        `curl -fsSLo ${PRESEED_DIR}/linux-x64.zst ${ENGINE_URL}`,
        `echo "${ENGINE_ZST_SHA256}  ${PRESEED_DIR}/linux-x64.zst" | sha256sum -c -`,
        `chmod -R a+rX,go-w ${PRESEED_DIR}`,
        // Desktop asks `gh` for pull request status and toasts "GitHub CLI authentication expired".
        'dpkg -r gh',
      ].join(' && '),
      { user: 'root' },
    )
    .makeDir('/etc/claude-desktop', { user: 'root', mode: 0o755 })
    .copy(`${ASSETS}/managed-settings.json`, '/etc/claude-desktop/managed-settings.json', {
      user: 'root',
      mode: 0o644,
    })
    .makeDir(DESKTOP_DIR, { user: 'root', mode: 0o755 })
    .copy(`${ASSETS}/boot.sh`, DESKTOP_BOOT, { user: 'root', mode: 0o755 })
    .makeDir(KEYRING_DIR, { user: 'user', mode: 0o700 })
    .copy(`${ASSETS}/default`, `${KEYRING_DIR}/default`, { user: 'user', mode: 0o600 })
    .copy(`${ASSETS}/Default_Keyring.keyring`, `${KEYRING_DIR}/Default_Keyring.keyring`, {
      user: 'user',
      mode: 0o600,
    })

const printsNothing = (cmd: string) => `out=$(set -o pipefail; ${cmd}) && test -z "$out"`

/**
 * The mods template's SNAPSHOT_HARDENING (scripts/build-e2b-mod-template.ts), minus its Claude Code
 * CLI checks. Stripping setuid takes chrome-sandbox's bit, and user namespaces are off, so Electron's
 * own sandbox cannot start: Desktop must run with --no-sandbox in the hardened snapshot.
 */
const HARDENING: ReadonlyArray<{ user: 'root' | 'user'; cmd: string }> = [
  ...[
    "sed -i '/^user ALL=/d' /etc/sudoers",
    'rm -rf /etc/sudoers.d/*',
    'gpasswd -d user sudo',
    'chmod -R go-w /usr/local',
    'find / -xdev -perm /6000 -type f -exec chmod ug-s {} +',
    'passwd -l root',
    'passwd -l user',
    'systemctl mask --now ssh.service ssh.socket rpcbind.service rpcbind.socket',
    'chmod go-w /etc/inittab /code',
    'sysctl -w user.max_user_namespaces=0',
    printsNothing(
      'find /opt/statuslines /usr/local /usr/lib/claude-desktop /etc/claude-desktop -perm /022 -not -type l',
    ),
    printsNothing('find / -xdev -perm /6000 -type f'),
    printsNothing(
      'find / -xdev -perm -0002 ! -type l ! -type d ! -path "/tmp/*" ! -path "/proc/*"',
    ),
    printsNothing(
      'find / -xdev -type d -perm -0002 ! -perm -1000 ! -path "/tmp/*" ! -path "/var/tmp/*"',
    ),
    'test "$(cat /proc/sys/user/max_user_namespaces)" = 0',
  ].map((cmd) => ({ user: 'root' as const, cmd })),
  ...['! echo | timeout 5 su -c true root', '! sudo -n true', '! unshare -Ur true'].map((cmd) => ({
    user: 'user' as const,
    cmd,
  })),
]

async function snapshot(apiKey: string) {
  const sandbox = await Sandbox.create(DESKTOP_TEMPLATE_NAME, { apiKey, timeoutMs: 300_000 })
  try {
    for (const { user, cmd } of HARDENING) {
      await sandbox.commands.run(cmd, { user, timeoutMs: 120_000 })
    }
    const { snapshotId } = await sandbox.createSnapshot({ apiKey })
    console.log(`hardened snapshot: ${snapshotId}`)
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

async function main() {
  const apiKey = stagingE2bKey()
  const started = performance.now()
  const build = await Template.build(desktopTemplate(), DESKTOP_TEMPLATE_NAME, {
    apiKey,
    cpuCount: 4,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  })
  console.log(
    `built ${DESKTOP_TEMPLATE_NAME} build=${build.buildId} in ${Math.round((performance.now() - started) / 1000)} s`,
  )
  const sandbox = await Sandbox.create(DESKTOP_TEMPLATE_NAME, { apiKey, timeoutMs: 120_000 })
  try {
    const out = await sandbox.commands.run(
      'du -sh --exclude=/proc --exclude=/sys / 2>/dev/null | tail -1; df -h / | tail -1; nproc; free -m | sed -n 2p',
      { user: 'root', timeoutMs: 120_000 },
    )
    console.log(out.stdout)
  } finally {
    await sandbox.kill().catch(() => {})
  }
  if (process.argv.includes('--snapshot')) await snapshot(apiKey)
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    },
  )
}
