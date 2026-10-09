import { Sandbox, Template, type TemplateClass } from 'e2b'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  E2B_TEMPLATE_BUILD_NAME,
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_REPLAY_DIR,
} from '@/render/e2b-template'
import {
  buildModSnapshot,
  MOD_TEMPLATE_PACKAGES,
  modRenderTemplate,
} from '../../scripts/build-e2b-mod-template'
import { buildSnapshot, renderTemplate } from '../../scripts/build-e2b-template'

type Step = { type: string; args: string[] }

async function steps(template: TemplateClass): Promise<Step[]> {
  return (JSON.parse(await Template.toJSON(template, false)) as { steps: Step[] }).steps
}

async function runCommands(template: TemplateClass): Promise<string[]> {
  return (await steps(template))
    .filter((s) => s.type === 'RUN')
    .flatMap((s) => (s.args[0] ? s.args[0].split(' && ') : []))
}

async function installedVersion(template: TemplateClass, pkg: string): Promise<string | undefined> {
  const spec = new RegExp(`npm install .*${pkg.replace('/', '\\/')}@(\\S+)`)
  for (const command of await runCommands(template)) {
    const match = command.match(spec)
    if (match) return match[1]
  }
  return undefined
}

describe('mod render template definition', () => {
  it('installs Claude Code 2.1.296 exactly, never a range', async () => {
    const version = await installedVersion(modRenderTemplate(), '@anthropic-ai/claude-code')
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(version).toBe('2.1.296')
  })

  it('installs @xterm/headless 6.0.0 exactly for in-sandbox replay', async () => {
    expect(await installedVersion(modRenderTemplate(), '@xterm/headless')).toBe('6.0.0')
  })

  it('extends the status line template step for step', async () => {
    const base = await steps(renderTemplate())
    expect((await steps(modRenderTemplate())).slice(0, base.length)).toEqual(base)
  })

  it('leaves Claude Code out of the status line template', async () => {
    expect(await installedVersion(renderTemplate(), '@anthropic-ai/claude-code')).toBeUndefined()
  })
})

describe('mod template package integrity', () => {
  it('pins Claude Code, its Linux x64 native package and @xterm/headless', () => {
    expect(MOD_TEMPLATE_PACKAGES.map((p) => `${p.name}@${p.version}`)).toEqual([
      '@anthropic-ai/claude-code@2.1.296',
      '@anthropic-ai/claude-code-linux-x64@2.1.296',
      '@xterm/headless@6.0.0',
    ])
  })

  it('pins each package to an exact sha512 integrity', () => {
    for (const pkg of MOD_TEMPLATE_PACKAGES) {
      expect(pkg.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/)
    }
  })

  it('compares the registry integrity to the pin before any npm install', async () => {
    const commands = await runCommands(modRenderTemplate())
    const firstInstall = commands.findIndex((c) => c.includes('npm install'))
    expect(firstInstall).toBeGreaterThan(-1)
    for (const pkg of MOD_TEMPLATE_PACKAGES) {
      const check = commands.indexOf(
        `test "$(npm view ${pkg.name}@${pkg.version} dist.integrity)" = "${pkg.integrity}"`,
      )
      expect(check, `${pkg.name} integrity check`).toBeGreaterThan(-1)
      expect(check).toBeLessThan(firstInstall)
    }
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
        events.push(`run:${opts?.user}`)
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
  vi.spyOn(Template, 'build').mockResolvedValue({ buildId: 'b1' } as never)
  vi.spyOn(Sandbox, 'create').mockResolvedValue(sandbox as never)
  return { events, ran, sandbox }
}

describe('snapshot hardening', () => {
  beforeEach(() => {
    vi.stubEnv('E2B_API_KEY', 'test-key')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('strips sudo and write access as root, then proves it as user, before the mod snapshot', async () => {
    const { events, ran } = fakeE2b()

    await buildModSnapshot()

    const asRoot = ran.filter((r) => r.user === 'root').map((r) => r.cmd)
    const asUser = ran.filter((r) => r.user === 'user').map((r) => r.cmd)
    expect(asRoot.join('\n')).toContain("sed -i '/^user ALL=/d' /etc/sudoers")
    expect(asRoot.join('\n')).toContain('rm -rf /etc/sudoers.d/*')
    expect(asRoot.join('\n')).toContain('gpasswd -d user sudo')
    expect(asRoot.join('\n')).toContain('chmod -R go-w /usr/local')
    expect(asRoot.join('\n')).toContain(
      'test -z "$(find /opt/statuslines /usr/local -perm /022 -not -type l)"',
    )
    expect(asUser).toEqual(
      expect.arrayContaining([
        '! sudo -n true',
        `test ! -w ${SANDBOX_CLAUDE_CODE_BIN}`,
        `test ! -w ${SANDBOX_CANNED_MODEL_SERVER_DEST}`,
        `test ! -w ${SANDBOX_REPLAY_DIR}`,
      ]),
    )
    expect(ran[0]?.user).toBe('root')
    expect(events.slice(-2)).toEqual(['snapshot', 'kill'])
  })

  it('takes no snapshot when a hardening assertion fails', async () => {
    const { sandbox } = fakeE2b((cmd) => cmd === '! sudo -n true')

    await expect(buildModSnapshot()).rejects.toThrow('sudo')
    expect(sandbox.createSnapshot).not.toHaveBeenCalled()
    expect(sandbox.kill).toHaveBeenCalled()
  })

  it('runs no hardening in the status line build', async () => {
    const { events, sandbox } = fakeE2b()

    await buildSnapshot(renderTemplate(), E2B_TEMPLATE_BUILD_NAME, 'E2B_TEMPLATE_ID')

    expect(sandbox.commands.run).not.toHaveBeenCalled()
    expect(events).toEqual(['snapshot', 'kill'])
  })
})
