import { Sandbox, Template, type TemplateClass } from 'e2b'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  E2B_DESKTOP_TEMPLATE_BUILD_NAME,
  SANDBOX_DESKTOP_BOOT,
  SANDBOX_DESKTOP_ENGINE_VERSION,
  SANDBOX_DESKTOP_MANAGED_SETTINGS,
} from '@/render/e2b-template'
import { feedScenario, feedStdin } from '@/render/mods/scenario-feed'
import { MODEL_URL } from '@/render/mods/session'
import {
  buildDesktopSnapshot,
  DESKTOP_DEB_SHA256,
  DESKTOP_ENGINE_SHA256,
  DESKTOP_ENGINE_VERSION,
  DESKTOP_VERSION,
  desktopTemplate,
  managedSettings,
} from '../../scripts/build-e2b-desktop-template'
import { modRenderTemplate } from '../../scripts/build-e2b-mod-template'

type Step = { type: string; args: string[] }

async function steps(template: TemplateClass): Promise<Step[]> {
  return (JSON.parse(await Template.toJSON(template, false)) as { steps: Step[] }).steps
}

async function runCommands(template: TemplateClass): Promise<string[]> {
  return (await steps(template))
    .filter((s) => s.type === 'RUN')
    .flatMap((s) => (s.args[0] ? s.args[0].split(' && ') : []))
}

describe('desktop template definition', () => {
  it('extends the mod template step for step', async () => {
    const base = await steps(modRenderTemplate())
    expect((await steps(desktopTemplate())).slice(0, base.length)).toEqual(base)
  })

  it('checks the pinned Desktop .deb against its sha256 before installing it', async () => {
    const commands = await runCommands(desktopTemplate())
    const check = commands.indexOf(
      `echo "${DESKTOP_DEB_SHA256}  claude-desktop.deb" | sha256sum -c -`,
    )
    const install = commands.findIndex(
      (c) => c.includes('apt-get install') && c.includes('./claude-desktop.deb'),
    )
    expect(DESKTOP_DEB_SHA256).toMatch(/^[0-9a-f]{64}$/)
    expect(check).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(check)
    expect(commands).toContain(
      `test "$(dpkg-query -W -f='\${Version}' claude-desktop)" = "${DESKTOP_VERSION}"`,
    )
  })

  it('preseeds the engine Desktop pins, checked against its sha256', async () => {
    const commands = await runCommands(desktopTemplate())
    expect(DESKTOP_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(DESKTOP_ENGINE_SHA256).toMatch(/^[0-9a-f]{64}$/)
    const download = commands.findIndex((c) =>
      c.includes(`claude-code-releases/${DESKTOP_ENGINE_VERSION}/linux-x64/claude.zst`),
    )
    const check = commands.findIndex((c) => c.startsWith(`echo "${DESKTOP_ENGINE_SHA256}  `))
    expect(download).toBeGreaterThan(-1)
    expect(check).toBe(download + 1)
  })

  it('installs a virtual display, input and screenshot tools', async () => {
    const install = (await runCommands(desktopTemplate())).find((c) =>
      c.includes('./claude-desktop.deb'),
    )
    for (const pkg of ['xvfb', 'xdotool', 'imagemagick', 'dbus-x11', 'gnome-keyring']) {
      expect(install).toMatch(new RegExp(`\\b${pkg}\\b`))
    }
  })

  it('removes gh, which Desktop asks for pull request status', async () => {
    expect(await runCommands(desktopTemplate())).toContain('dpkg -r gh')
  })

  it('installs the boot script root-owned and read-only to user', async () => {
    const copy = (await steps(desktopTemplate())).find(
      (s) => s.type === 'COPY' && s.args.includes(SANDBOX_DESKTOP_BOOT),
    )
    expect(copy).toBeDefined()
  })

  it('records the preseeded engine version root-owned, to be read before any mod code runs', async () => {
    const commands = await runCommands(desktopTemplate())
    const write = commands.indexOf(
      `echo ${DESKTOP_ENGINE_VERSION} > ${SANDBOX_DESKTOP_ENGINE_VERSION}`,
    )
    const check = commands.findIndex((c) => c.startsWith(`echo "${DESKTOP_ENGINE_SHA256}  `))
    expect(write).toBeGreaterThan(check)
  })

  it('writes managed settings that point Desktop at the canned model server', async () => {
    const settings = managedSettings()
    expect(settings.inferenceProvider).toBe('gateway')
    expect(settings.inferenceGatewayBaseUrl).toBe(MODEL_URL)
    expect(settings.inferenceModels).toEqual([feedStdin(feedScenario()).model.id])
    expect(settings.disableAutoUpdates).toBe(true)
    const encoded = Buffer.from(JSON.stringify(settings)).toString('base64')
    expect(await runCommands(desktopTemplate())).toContain(
      `echo ${encoded} | base64 -d > ${SANDBOX_DESKTOP_MANAGED_SETTINGS}`,
    )
  })
})

type Ran = { cmd: string; user: string | undefined }

function fakeE2b(failWhen: (cmd: string) => boolean = () => false) {
  const events: string[] = []
  const ran: Ran[] = []
  const sandbox = {
    commands: {
      run: vi.fn(async (cmd: string, opts?: { user?: string }) => {
        ran.push({ cmd, user: opts?.user })
        if (failWhen(cmd)) throw new Error(`exit 1: ${cmd}`)
        return { exitCode: 0, stdout: '', stderr: '' }
      }),
    },
    createSnapshot: vi.fn(async () => {
      events.push('snapshot')
      return { snapshotId: 'snap:default' }
    }),
    kill: vi.fn(async () => {
      events.push('kill')
    }),
  }
  const build = vi.spyOn(Template, 'build').mockResolvedValue({ buildId: 'b1' } as never)
  vi.spyOn(Sandbox, 'create').mockResolvedValue(sandbox as never)
  return { events, ran, sandbox, build }
}

const DESKTOP_ROOTS_NOT_WRITABLE =
  'out=$(set -o pipefail; find /opt/statuslines /usr/local /usr/lib/claude-desktop /etc/claude-desktop -perm /022 -not -type l) && test -z "$out"'

describe('desktop snapshot', () => {
  beforeEach(() => {
    vi.stubEnv('E2B_API_KEY', 'test-key')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('builds with room for Electron', async () => {
    const { build } = fakeE2b()

    await buildDesktopSnapshot()

    expect(build).toHaveBeenCalledWith(
      expect.anything(),
      E2B_DESKTOP_TEMPLATE_BUILD_NAME,
      expect.objectContaining({ cpuCount: 4, memoryMB: 4096 }),
    )
  })

  it('runs the mod hardening and proves Desktop is not writable before the snapshot', async () => {
    const { events, ran } = fakeE2b()

    await buildDesktopSnapshot()

    const commands = ran.map((r) => r.cmd)
    expect(commands).toEqual(
      expect.arrayContaining([
        "sed -i '/^user ALL=/d' /etc/sudoers",
        'find / -xdev -perm /6000 -type f -exec chmod ug-s {} +',
        'sysctl -w user.max_user_namespaces=0',
        DESKTOP_ROOTS_NOT_WRITABLE,
      ]),
    )
    expect(ran.find((r) => r.cmd === DESKTOP_ROOTS_NOT_WRITABLE)?.user).toBe('root')
    expect(ran.filter((r) => r.user === 'user').map((r) => r.cmd)).toEqual(
      expect.arrayContaining([
        `test -e ${SANDBOX_DESKTOP_BOOT} && test ! -w ${SANDBOX_DESKTOP_BOOT}`,
        `test -e ${SANDBOX_DESKTOP_MANAGED_SETTINGS} && test ! -w ${SANDBOX_DESKTOP_MANAGED_SETTINGS}`,
        `test -e ${SANDBOX_DESKTOP_ENGINE_VERSION} && test ! -w ${SANDBOX_DESKTOP_ENGINE_VERSION}`,
        'test -e /usr/lib/claude-desktop/claude-desktop && test ! -w /usr/lib/claude-desktop/claude-desktop',
      ]),
    )
    expect(events.slice(-2)).toEqual(['snapshot', 'kill'])
  })

  it('takes no snapshot when Desktop is writable', async () => {
    const { sandbox } = fakeE2b((cmd) => cmd === DESKTOP_ROOTS_NOT_WRITABLE)

    await expect(buildDesktopSnapshot()).rejects.toThrow(DESKTOP_ROOTS_NOT_WRITABLE)
    expect(sandbox.createSnapshot).not.toHaveBeenCalled()
    expect(sandbox.kill).toHaveBeenCalled()
  })
})
