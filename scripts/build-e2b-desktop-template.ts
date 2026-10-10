import {
  E2B_DESKTOP_TEMPLATE_BUILD_NAME,
  SANDBOX_DESKTOP_BOOT,
  SANDBOX_DESKTOP_DIR,
  SANDBOX_DESKTOP_MANAGED_SETTINGS,
} from '@/render/e2b-template'
import { feedScenario, feedStdin } from '@/render/mods/scenario-feed'
import { FAKE_API_KEY, MODEL_URL } from '@/render/mods/session'
import { hardenSnapshot, modRenderTemplate } from './build-e2b-mod-template'
import { buildSnapshot } from './build-e2b-template'

/**
 * Builds the E2B template that records mods in Claude Desktop: the mod template plus the real
 * Claude Desktop for Linux, a virtual display (Xvfb), xdotool to drive it and ImageMagick to
 * screenshot, compare and crop it.
 *
 * - Desktop is the pinned `.deb` from Anthropic's apt pool, checked against the sha256 its
 *   repository index lists.
 * - Desktop downloads its Claude Code engine on first use, unless
 *   `resources/preseed/claude-code/<platform>.zst` matches the engine pin compiled into the app.
 *   The build fetches that exact file and checks the same sha256, so the sandbox stays offline.
 * - Managed settings put Desktop in gateway mode against the canned model server, so no sign-in.
 * - The mod hardening is applied as-is. Stripping setuid takes chrome-sandbox's bit and user
 *   namespaces are off, so Electron's own sandbox cannot start: Desktop runs with --no-sandbox.
 *
 * Upgrading Desktop: update both pins, rebuild, run `bun run smoke:desktop` to check the fixed
 * click positions in src/render/mods/desktop/screen.ts still land, then re-render every mod.
 *
 * Run:  bun run build:e2b-desktop-template
 */

export const DESKTOP_VERSION = '2.31226.1'
export const DESKTOP_DEB_SHA256 = '5a9bebdfcb1df6ce38767b373f3a7fabf77156a2ddd8a3f5d04961da5bde305e'
const DESKTOP_DEB_URL = `https://downloads.claude.ai/claude-desktop/apt/stable/pool/main/c/claude-desktop/claude-desktop_${DESKTOP_VERSION}_amd64.deb`
/** The engine pin compiled into Desktop 2.31226.1; Desktop installs only this preseed. */
export const DESKTOP_ENGINE_VERSION = '2.1.295'
export const DESKTOP_ENGINE_SHA256 =
  '71164c85f9d226928dec7acda1baf000f1991eb14fcec106536d84bd914032f8'
const DESKTOP_ENGINE_URL = `https://downloads.claude.ai/claude-code-releases/${DESKTOP_ENGINE_VERSION}/linux-x64/claude.zst`
const DESKTOP_INSTALL_DIR = '/usr/lib/claude-desktop'
const DESKTOP_BINARY = `${DESKTOP_INSTALL_DIR}/claude-desktop`
const PRESEED_FILE = `${DESKTOP_INSTALL_DIR}/resources/preseed/claude-code/linux-x64.zst`
const ASSETS = 'src/render/mods/desktop/sandbox'
const KEYRING_DIR = '/home/user/.local/share/keyrings'

const DESKTOP_PACKAGES = [
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

/** Desktop's managed settings: gateway mode on the canned model, nothing phoning home. */
export function managedSettings() {
  return {
    inferenceProvider: 'gateway',
    inferenceGatewayBaseUrl: MODEL_URL,
    inferenceGatewayApiKey: FAKE_API_KEY,
    inferenceGatewayAuthScheme: 'x-api-key',
    inferenceModels: [feedStdin(feedScenario()).model.id],
    disableEssentialTelemetry: true,
    disableNonessentialTelemetry: true,
    disableNonessentialServices: true,
    disableAutoUpdates: true,
    disableFeatureDiscovery: true,
    disableDeploymentModeChooser: true,
    modelCatalogEnabled: false,
  }
}

export const desktopTemplate = () =>
  modRenderTemplate()
    .runCmd(
      [
        'cd /tmp',
        `curl -fsSLo claude-desktop.deb ${DESKTOP_DEB_URL}`,
        `echo "${DESKTOP_DEB_SHA256}  claude-desktop.deb" | sha256sum -c -`,
        // Desktop's postinstall would otherwise add its apt repository.
        'echo CLAUDE_DESKTOP_ADD_REPO=\\"false\\" > /etc/default/claude-desktop',
        'apt-get update -qq',
        `DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ./claude-desktop.deb ${DESKTOP_PACKAGES.join(' ')}`,
        'rm -f claude-desktop.deb',
        `test "$(dpkg-query -W -f='\${Version}' claude-desktop)" = "${DESKTOP_VERSION}"`,
        `mkdir -p ${PRESEED_FILE.slice(0, PRESEED_FILE.lastIndexOf('/'))}`,
        `curl -fsSLo ${PRESEED_FILE} ${DESKTOP_ENGINE_URL}`,
        `echo "${DESKTOP_ENGINE_SHA256}  ${PRESEED_FILE}" | sha256sum -c -`,
        `chmod -R a+rX,go-w ${DESKTOP_INSTALL_DIR}/resources/preseed`,
        // Desktop asks `gh` for pull request status and toasts "GitHub CLI authentication expired".
        'dpkg -r gh',
      ].join(' && '),
      { user: 'root' },
    )
    .makeDir('/etc/claude-desktop', { user: 'root', mode: 0o755 })
    .runCmd(
      [
        `echo ${Buffer.from(JSON.stringify(managedSettings())).toString('base64')} | base64 -d > ${SANDBOX_DESKTOP_MANAGED_SETTINGS}`,
        `chmod 0644 ${SANDBOX_DESKTOP_MANAGED_SETTINGS}`,
      ].join(' && '),
      { user: 'root' },
    )
    .makeDir(SANDBOX_DESKTOP_DIR, { user: 'root', mode: 0o755 })
    .copy(`${ASSETS}/boot.sh`, SANDBOX_DESKTOP_BOOT, { user: 'root', mode: 0o755 })
    .makeDir(KEYRING_DIR, { user: 'user', mode: 0o700 })
    .copy(`${ASSETS}/keyring/default`, `${KEYRING_DIR}/default`, { user: 'user', mode: 0o600 })
    .copy(`${ASSETS}/keyring/Default_Keyring.keyring`, `${KEYRING_DIR}/Default_Keyring.keyring`, {
      user: 'user',
      mode: 0o600,
    })

const DESKTOP_HARDENING = {
  protectedRoots: [DESKTOP_INSTALL_DIR, '/etc/claude-desktop'],
  readOnlyPaths: [
    DESKTOP_BINARY,
    PRESEED_FILE,
    SANDBOX_DESKTOP_BOOT,
    SANDBOX_DESKTOP_MANAGED_SETTINGS,
  ],
}

export const buildDesktopSnapshot = () =>
  buildSnapshot(
    desktopTemplate(),
    E2B_DESKTOP_TEMPLATE_BUILD_NAME,
    'E2B_DESKTOP_TEMPLATE_ID',
    (sandbox) => hardenSnapshot(sandbox, DESKTOP_HARDENING),
    { cpuCount: 4, memoryMB: 4096 },
  )

if (import.meta.main) {
  await buildDesktopSnapshot()
  process.exit(0)
}
