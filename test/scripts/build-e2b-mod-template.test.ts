import { Sandbox, Template, type TemplateClass } from 'e2b'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
import { buildStatuslineSnapshot, renderTemplate } from '../../scripts/build-e2b-template'

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

  it('installs iproute2 in the status line template so the build can list listening sockets with ss', async () => {
    expect((await steps(renderTemplate())).map((s) => s.args.join(' '))).toEqual(
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

const FILE_MOUNTS = `/ $(findmnt -rn -o TARGET,FSTYPE | awk '$1 != "/" && $2 !~ /^(proc|sysfs|securityfs|selinuxfs|devpts|cgroup2|pstore|bpf|autofs|binfmt_misc|mqueue|hugetlbfs|debugfs|fusectl|rpc_pipefs)$/ { print $1 }')`

const HARDENING_STEPS = [
  "sed -i '/^user ALL=/d' /etc/sudoers",
  'rm -rf /etc/sudoers.d/*',
  'gpasswd -d user sudo',
  'chmod -R go-w /usr/local',
  `find ${FILE_MOUNTS} -xdev -perm /6000 -type f -exec chmod ug-s {} +`,
  `find ${FILE_MOUNTS} -xdev -type f -exec getcap {} + | cut -d' ' -f1 | xargs -r setcap -r`,
  'passwd -l root',
  'passwd -l user',
  'systemctl mask --now ssh.service ssh.socket rpcbind.service rpcbind.socket',
  'chmod go-w /etc/inittab /code',
  'sysctl -w user.max_user_namespaces=0',
]

const noOutput = (cmd: string) => `out=$(set -o pipefail; ${cmd}) && test -z "$out"`

const ROOT_ASSERTIONS = [
  noOutput('find /opt/statuslines /usr/local -perm /022 -not -type l'),
  noOutput(`find ${FILE_MOUNTS} -xdev -perm /6000 -type f`),
  noOutput(`find ${FILE_MOUNTS} -xdev -type f -exec getcap {} +`),
  noOutput(
    `find ${FILE_MOUNTS} -xdev -perm -0002 ! -type l ! -type d ! -type s ! -path /dev/null ! -path /dev/zero ! -path /dev/full ! -path /dev/random ! -path /dev/urandom ! -path /dev/tty ! -path /dev/ptmx ! -path /dev/fuse ! -path "/tmp/*" ! -path "/proc/*"`,
  ),
  noOutput(
    `find ${FILE_MOUNTS} -xdev -type d -perm -0002 ! -perm -1000 ! -path "/tmp/*" ! -path "/var/tmp/*"`,
  ),
  'test "$(cat /proc/sys/user/max_user_namespaces)" = 0',
  'passwd -S root | awk \'{ exit $2 != "L" }\'',
  'passwd -S user | awk \'{ exit $2 != "L" }\'',
  noOutput(
    `ss -Hltunp | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r -n1 ps -o user=,comm= -p | awk '$1 == "root" && $2 != "envd"'`,
  ),
]

const notWritable = (path: string) => `test -e ${path} && test ! -w ${path}`

const STATUSLINE_USER_ASSERTIONS = [
  '! echo | timeout 5 su -c true root',
  '! sudo -n true',
  'test -x /usr/bin/unshare && ! unshare -Ur true',
  ...[
    '/usr/local/bin/jq',
    '/usr/local/bin',
    '/usr/local/share/ca-certificates/statuslines-anthropic-usage-ca.crt',
    '/usr/local/share/ca-certificates',
    '/opt/statuslines/anthropic-usage',
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/hosts',
  ].map(notWritable),
  'test "$(jq --version)" = "jq-1.7.1"',
]

const MOD_USER_ASSERTIONS = [
  ...STATUSLINE_USER_ASSERTIONS,
  `echo "${CLAUDE_CODE_BINARY_SHA256}  ${SANDBOX_CLAUDE_CODE_BIN}" | sha256sum -c -`,
  ...[
    SANDBOX_CLAUDE_CODE_BIN,
    `${SANDBOX_CLAUDE_CODE_PREFIX}/bin`,
    SANDBOX_CANNED_MODEL_SERVER_DEST,
    SANDBOX_CANNED_MODEL_DIR,
    SANDBOX_REPLAY_DIR,
    '/opt/statuslines',
    '/opt',
  ].map(notWritable),
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

describe.each([
  {
    template: 'status line',
    build: buildStatuslineSnapshot,
    userAssertions: STATUSLINE_USER_ASSERTIONS,
  },
  { template: 'mod', build: buildModSnapshot, userAssertions: MOD_USER_ASSERTIONS },
])('$template snapshot hardening', ({ build, userAssertions }) => {
  beforeEach(() => {
    vi.stubEnv('E2B_API_KEY', 'test-key')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('strips every route to root as root, then proves it, before the snapshot', async () => {
    const { events, ran } = fakeE2b()

    await build()

    expect(ran.filter((r) => r.user === 'root').map((r) => r.cmd)).toEqual(
      expect.arrayContaining([...HARDENING_STEPS, ...ROOT_ASSERTIONS]),
    )
    expect(ran.filter((r) => r.user === 'user').map((r) => r.cmd)).toEqual(
      expect.arrayContaining(userAssertions),
    )
    const lastHardening = Math.max(...HARDENING_STEPS.map((c) => ran.findIndex((r) => r.cmd === c)))
    const firstAssertion = Math.min(
      ...[...ROOT_ASSERTIONS, ...userAssertions].map((c) => ran.findIndex((r) => r.cmd === c)),
    )
    expect(lastHardening).toBeLessThan(firstAssertion)
    expect(events.slice(-2)).toEqual(['snapshot', 'kill'])
  })

  it.each([...HARDENING_STEPS, ...ROOT_ASSERTIONS, ...userAssertions])(
    'takes no snapshot when `%s` fails',
    async (assertion) => {
      const { sandbox } = fakeE2b((cmd) => cmd === assertion)

      await expect(build()).rejects.toThrow(assertion)
      expect(sandbox.createSnapshot).not.toHaveBeenCalled()
      expect(sandbox.kill).toHaveBeenCalled()
    },
  )
})
