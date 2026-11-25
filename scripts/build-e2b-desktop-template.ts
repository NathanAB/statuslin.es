import {
  E2B_DESKTOP_TEMPLATE_BUILD_NAME,
  SANDBOX_DESKTOP_BOOT,
  SANDBOX_DESKTOP_DIR,
  SANDBOX_DESKTOP_ENGINE_VERSION,
  SANDBOX_DESKTOP_MANAGED_SETTINGS,
  SANDBOX_ENGINE_MANAGED_SETTINGS,
} from '@/render/e2b-template'
import { FAKE_API_KEY, MODEL_URL } from '@/render/mods/session'
import { HAIKU, OPUS, SONNET } from '@/render/scenario-helpers'
import { MOD_HARDENING, modRenderTemplate } from './build-e2b-mod-template'
import { buildSnapshot, hardenSnapshot } from './build-e2b-template'

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
 * Upgrading Desktop: update both pins, rebuild, run `bun run smoke:desktop <out-dir>` to check the
 * fixed click positions in src/render/mods/desktop/screen.ts still land, then re-render every mod.
 *
 * Run:  bun run build:e2b-desktop-template
 */

export const DESKTOP_VERSION = '6.28899.6'
export const DESKTOP_DEB_SHA256 = '7e381601d86570149643d52e9b89c26575ab12fa788aa41ffdd4cca5b0638cf8'
const DESKTOP_DEB_URL = `https://downloads.claude.ai/claude-desktop/apt/stable/pool/main/c/claude-desktop/claude-desktop_${DESKTOP_VERSION}_amd64.deb`
/** The engine pin compiled into Desktop 6.28899.6; Desktop installs only this preseed. */
export const DESKTOP_ENGINE_VERSION = '2.1.330'
export const DESKTOP_ENGINE_SHA256 =
  'd53a3f9aab93c87bba0813d1101677677b457100824f5c3604fea9915ac5237a'
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

/**
 * Desktop's managed settings: gateway mode on the canned model, nothing phoning home. Desktop
 * passes `inferenceModels` to its engine as the model allowlist and pins each tier alias to its
 * entry, so a mod's `$.model.complete({ model: 'haiku' })` reaches the canned model as it does in
 * the terminal. The feed's model comes first, and Desktop opens the session on it.
 */
export function managedSettings() {
  return {
    inferenceProvider: 'gateway',
    inferenceGatewayBaseUrl: MODEL_URL,
    inferenceGatewayApiKey: FAKE_API_KEY,
    inferenceGatewayAuthScheme: 'x-api-key',
    inferenceModels: [
      { name: OPUS.id, anthropicFamilyTier: 'opus' },
      { name: SONNET.id, anthropicFamilyTier: 'sonnet' },
      { name: HAIKU.id, anthropicFamilyTier: 'haiku' },
    ],
    disableEssentialTelemetry: true,
    disableNonessentialTelemetry: true,
    disableNonessentialServices: true,
    disableAutoUpdates: true,
    disableFeatureDiscovery: true,
    disableDeploymentModeChooser: true,
    modelCatalogEnabled: false,
  }
}

/**
 * Claude Code's managed settings. Desktop runs with managed settings, so its engine seats a bundled
 * security plugin ahead of mods' hooks, which skips some of them (reflect-mod's prompt.compose,
 * with a notice in the chat). An empty list leaves it out, as on a machine without managed
 * settings. Without `merge`, this file replaces the policy Desktop passes its engine, and every
 * session says the organization's policy isn't fully applied.
 */
const engineManagedSettings = () => ({ prependPlugins: [], parentSettingsBehavior: 'merge' })

const writeRootFile = (path: string, data: unknown) =>
  [
    `echo ${Buffer.from(JSON.stringify(data)).toString('base64')} | base64 -d > ${path}`,
    `chmod 0644 ${path}`,
  ].join(' && ')

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
    .runCmd(writeRootFile(SANDBOX_DESKTOP_MANAGED_SETTINGS, managedSettings()), { user: 'root' })
    .makeDir('/etc/claude-code', { user: 'root', mode: 0o755 })
    .runCmd(writeRootFile(SANDBOX_ENGINE_MANAGED_SETTINGS, engineManagedSettings()), {
      user: 'root',
    })
    .makeDir(SANDBOX_DESKTOP_DIR, { user: 'root', mode: 0o755 })
    .copy(`${ASSETS}/boot.sh`, SANDBOX_DESKTOP_BOOT, { user: 'root', mode: 0o755 })
    // Read by the recorder before any mod code runs; Desktop installs only the preseed checked above.
    .runCmd(
      [
        `echo ${DESKTOP_ENGINE_VERSION} > ${SANDBOX_DESKTOP_ENGINE_VERSION}`,
        `chmod 0644 ${SANDBOX_DESKTOP_ENGINE_VERSION}`,
      ].join(' && '),
      { user: 'root' },
    )
    .makeDir(KEYRING_DIR, { user: 'user', mode: 0o700 })
    .copy(`${ASSETS}/keyring/default`, `${KEYRING_DIR}/default`, { user: 'user', mode: 0o600 })
    .copy(`${ASSETS}/keyring/Default_Keyring.keyring`, `${KEYRING_DIR}/Default_Keyring.keyring`, {
      user: 'user',
      mode: 0o600,
    })

const DESKTOP_HARDENING = {
  protectedRoots: [DESKTOP_INSTALL_DIR, '/etc/claude-desktop', '/etc/claude-code'],
  readOnlyPaths: [
    DESKTOP_BINARY,
    PRESEED_FILE,
    SANDBOX_DESKTOP_BOOT,
    SANDBOX_DESKTOP_MANAGED_SETTINGS,
    SANDBOX_ENGINE_MANAGED_SETTINGS,
    SANDBOX_DESKTOP_ENGINE_VERSION,
    // A directory `user` could write would let it replace a file in it, or add a drop-in.
    '/etc/claude-desktop',
    '/etc/claude-code',
  ],
}

export const buildDesktopSnapshot = () =>
  buildSnapshot(
    desktopTemplate(),
    E2B_DESKTOP_TEMPLATE_BUILD_NAME,
    'E2B_DESKTOP_TEMPLATE_ID',
    (sandbox) => hardenSnapshot(sandbox, MOD_HARDENING, DESKTOP_HARDENING),
    { cpuCount: 4, memoryMB: 4096 },
  )

if (import.meta.main) {
  await buildDesktopSnapshot()
  process.exit(0)
}
