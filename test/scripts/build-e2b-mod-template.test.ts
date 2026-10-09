import { Sandbox, Template, type TemplateClass } from 'e2b'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  E2B_TEMPLATE_BUILD_NAME,
  SANDBOX_CANNED_MODEL_DIR,
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_CLAUDE_CODE_PREFIX,
  SANDBOX_REPLAY_DIR,
} from '@/render/e2b-template'
import {
  buildModSnapshot,
  CLAUDE_CODE_BINARY_SHA256,
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

  it('installs iproute2 so the build can list listening sockets with ss', async () => {
    expect((await steps(modRenderTemplate())).map((s) => s.args.join(' '))).toEqual(
      expect.arrayContaining([expect.stringMatching(/apt-get install .*\biproute2\b/)]),
    )
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

describe('mod template Claude Code binary pin', () => {
  it('pins the native binary to an exact sha256', () => {
    expect(CLAUDE_CODE_BINARY_SHA256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('checks the binary against the pin right after npm installs Claude Code', async () => {
    const commands = await runCommands(modRenderTemplate())
    const install = commands.findIndex((c) => /npm install .*@anthropic-ai\/claude-code@/.test(c))
    expect(install).toBeGreaterThan(-1)
    expect(commands[install + 1]).toBe(
      `echo "${CLAUDE_CODE_BINARY_SHA256}  ${SANDBOX_CLAUDE_CODE_BIN}" | sha256sum -c -`,
    )
  })
})

type Ran = { cmd: string; user: string | undefined }

const HARDENING_STEPS = [
  "sed -i '/^user ALL=/d' /etc/sudoers",
  'rm -rf /etc/sudoers.d/*',
  'gpasswd -d user sudo',
  'chmod -R go-w /usr/local',
  'find / -xdev -perm /6000 -type f -exec chmod ug-s {} +',
  'passwd -l root',
  'passwd -l user',
  'systemctl mask --now ssh.service ssh.socket rpcbind.service rpcbind.socket',
]

const noOutput = (cmd: string) => `out=$(set -o pipefail; ${cmd}) && test -z "$out"`

const ROOT_ASSERTIONS = [
  noOutput('find /opt/statuslines /usr/local -perm /022 -not -type l'),
  noOutput('find / -xdev -perm /6000 -type f'),
  'passwd -S root | awk \'{ exit $2 != "L" }\'',
  'passwd -S user | awk \'{ exit $2 != "L" }\'',
  noOutput(
    `ss -Hltunp | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r -n1 ps -o user=,comm= -p | awk '$1 == "root" && $2 != "envd"'`,
  ),
]

const USER_ASSERTIONS = [
  '! echo | timeout 5 su -c true root',
  '! sudo -n true',
  ...[
    SANDBOX_CLAUDE_CODE_BIN,
    `${SANDBOX_CLAUDE_CODE_PREFIX}/bin`,
    SANDBOX_CANNED_MODEL_SERVER_DEST,
    SANDBOX_CANNED_MODEL_DIR,
    SANDBOX_REPLAY_DIR,
    '/opt/statuslines',
    '/opt',
  ].map((path) => `test -e ${path} && test ! -w ${path}`),
  `test "$(${SANDBOX_CLAUDE_CODE_BIN} --version | cut -d' ' -f1)" = "2.1.296"`,
  `cd ${SANDBOX_REPLAY_DIR} && node -e "require('@xterm/headless')"`,
]

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

  it('strips every route to root as root, then proves it, before the mod snapshot', async () => {
    const { events, ran } = fakeE2b()

    await buildModSnapshot()

    expect(ran.filter((r) => r.user === 'root').map((r) => r.cmd)).toEqual(
      expect.arrayContaining([...HARDENING_STEPS, ...ROOT_ASSERTIONS]),
    )
    expect(ran.filter((r) => r.user === 'user').map((r) => r.cmd)).toEqual(
      expect.arrayContaining(USER_ASSERTIONS),
    )
    const lastHardening = Math.max(...HARDENING_STEPS.map((c) => ran.findIndex((r) => r.cmd === c)))
    const firstAssertion = Math.min(
      ...[...ROOT_ASSERTIONS, ...USER_ASSERTIONS].map((c) => ran.findIndex((r) => r.cmd === c)),
    )
    expect(lastHardening).toBeLessThan(firstAssertion)
    expect(events.slice(-2)).toEqual(['snapshot', 'kill'])
  })

  it.each([
    ...ROOT_ASSERTIONS,
    ...USER_ASSERTIONS,
  ])('takes no snapshot when `%s` fails', async (assertion) => {
    const { sandbox } = fakeE2b((cmd) => cmd === assertion)

    await expect(buildModSnapshot()).rejects.toThrow(assertion)
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
