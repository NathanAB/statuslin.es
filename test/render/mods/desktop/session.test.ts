import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_USAGE_CA_PATH,
  ANTHROPIC_USAGE_PREVIEW_TOKEN,
} from '@/render/anthropic-usage-mock'
import {
  anthropicUsageMockFiles,
  anthropicUsageSetupScript,
} from '@/render/anthropic-usage-sandbox'
import { SANDBOX_DESKTOP_BOOT, SANDBOX_DESKTOP_ENGINE_VERSION } from '@/render/e2b-template'
import {
  bootCommand,
  deepLink,
  desktopEnv,
  desktopSessionFiles,
  desktopSessionNetwork,
  ENGINE_VERSION_COMMAND,
  FIT_WINDOW_COMMAND,
  isAnthropicHost,
  parseVersion,
  repliedCommand,
  stepFiles,
  stepTextPath,
  transcriptLinesCommand,
} from '@/render/mods/desktop/session'
import { busyPermissions, cannedReply, feedScenario } from '@/render/mods/scenario-feed'
import { FEED_PLUGIN_DIR, REPLY_FILE, sessionEnv } from '@/render/mods/session'

const scenario = feedScenario()
const CONFIG_DIR = sessionEnv(scenario).CLAUDE_CONFIG_DIR
const SEED = { target: 'token-weather', nowMs: 0, claudeCodeVersion: '2.1.295' }

describe('desktopEnv', () => {
  it('loads the scenario feed before the mod', () => {
    expect(desktopEnv(scenario, '/home/user/plugins/mod').CLAUDE_CODE_PLUGIN_DIRS).toBe(
      `${FEED_PLUGIN_DIR}:/home/user/plugins/mod`,
    )
    expect(desktopEnv(scenario, null).CLAUDE_CODE_PLUGIN_DIRS).toBe(FEED_PLUGIN_DIR)
  })

  it('gives the engine the session config but leaves Desktop its own home and gateway', () => {
    const env = desktopEnv(scenario, null)

    expect(env.CLAUDE_CONFIG_DIR).toBe(CONFIG_DIR)
    expect(env).not.toHaveProperty('HOME')
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(env).not.toHaveProperty('ANTHROPIC_BASE_URL')
  })

  it('sizes the virtual display to the window at device scale, in UTC', () => {
    expect(desktopEnv(scenario, null)).toMatchObject({ SCREEN: '2200x1800x24', TZ: 'UTC' })
  })
})

describe('bootCommand', () => {
  it('starts the boot script with Electron sandboxing off and the device scale forced', () => {
    const command = bootCommand(scenario, null)

    expect(command).toMatch(new RegExp(`^env .* ${SANDBOX_DESKTOP_BOOT} `))
    expect(command).toContain('--no-sandbox')
    expect(command).toContain('--force-device-scale-factor=2')
    expect(command).toContain(`CLAUDE_CONFIG_DIR='${CONFIG_DIR}'`)
  })
})

describe('FIT_WINDOW_COMMAND', () => {
  it('succeeds only once the window fills the display, so it can be polled', () => {
    expect(FIT_WINDOW_COMMAND).toContain('windowsize "$w" 2200 1800')
    expect(FIT_WINDOW_COMMAND).toContain(
      `xdotool getwindowgeometry --shell "$w" | grep -E '^(X|Y|WIDTH|HEIGHT)=' | tr '\\n' ' '`,
    )
    expect(FIT_WINDOW_COMMAND).toMatch(/= "X=0 Y=0 WIDTH=2200 HEIGHT=1800 "$/)
  })
})

describe('deepLink', () => {
  it('opens a Code session on the workspace with the scripted prompt typed', () => {
    expect(deepLink(scenario)).toBe('claude://code/new?folder=%2Fhome%2Fuser%2Fapp&q=hello')
  })
})

describe('desktopSessionFiles', () => {
  const files = new Map(desktopSessionFiles(scenario, SEED).map((f) => [f.path, f.data]))

  const settings = (all: Map<string, string>) =>
    JSON.parse(String(all.get(`${CONFIG_DIR}/settings.json`)))

  it('writes the committed sample status line and points the settings at it', () => {
    const script = `${CONFIG_DIR}/statusline.sh`

    expect(files.get(script)).toBe(
      readFileSync('src/render/mods/desktop/sandbox/statusline.sh', 'utf8'),
    )
    expect(settings(files)).toEqual({
      permissions: busyPermissions(scenario),
      statusLine: { type: 'command', command: `cat | bash ${script}` },
    })
  })

  it('writes one settings.json, the terminal session rules merged with the status line', () => {
    const paths = desktopSessionFiles(scenario, SEED).map((f) => f.path)

    expect(paths.filter((path) => path === `${CONFIG_DIR}/settings.json`)).toHaveLength(1)
  })

  it.each([
    {
      interpreter: 'python' as const,
      source: 'print("hi")',
      file: 'statusline.py',
      bin: 'python3',
    },
    {
      interpreter: 'node' as const,
      source: "import fs from 'node:fs'",
      file: 'statusline.mjs',
      bin: 'node',
    },
    { interpreter: 'bash' as const, source: 'echo hi', file: 'statusline.sh', bin: 'bash' },
  ])(
    'writes a given $interpreter status line in place of the sample and runs it with $bin',
    ({ interpreter, source, file, bin }) => {
      const given = new Map(
        desktopSessionFiles(scenario, SEED, { source, interpreter }).map((f) => [f.path, f.data]),
      )
      const script = `${CONFIG_DIR}/${file}`

      expect(given.get(script)).toBe(source)
      expect([...given.keys()].filter((path) => /\/statusline\./.test(path))).toEqual([script])
      // Piped, so a script reading /dev/stdin gets the JSON: statusline-anywhere's stdin is a socket.
      expect(settings(given).statusLine.command).toBe(`cat | ${bin} ${script}`)
    },
  )

  it('puts Desktop in dark theme', () => {
    expect(JSON.parse(String(files.get('/home/user/.config/Claude-3p/config.json')))).toEqual({
      userThemeMode: 'dark',
    })
  })

  it('keeps the terminal session files, so both surfaces see the same feed', () => {
    expect([...files.keys()]).toContain(`${CONFIG_DIR}/.claude.json`)
  })

  it('has the canned reply in place for the model server Desktop checks while it boots', () => {
    expect([...files.keys()]).toContain(REPLY_FILE)
  })

  describe('with the Anthropic usage mock', () => {
    const TOKEN_READER = {
      source: 'cat ~/.claude/.credentials.json',
      interpreter: 'bash' as const,
      networkHosts: ['api.anthropic.com', 'wttr.in'],
      readsClaudeToken: true,
    }
    const mocked = new Map(
      desktopSessionFiles(scenario, SEED, TOKEN_READER).map((f) => [f.path, f.data]),
    )

    it('gives only the status line command the preview token and CA, from the real home', () => {
      // In Desktop's env the engine would inherit the token and leave the gateway for OAuth.
      expect(settings(mocked).statusLine.command).toBe(
        `cat | env -u CLAUDE_CONFIG_DIR CLAUDE_CODE_OAUTH_TOKEN=${ANTHROPIC_USAGE_PREVIEW_TOKEN} NODE_EXTRA_CA_CERTS=${ANTHROPIC_USAGE_CA_PATH} bash ${CONFIG_DIR}/statusline.sh`,
      )
      expect(desktopEnv(scenario, null)).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
    })

    it("stages the mock's credentials and response with the session's files", () => {
      for (const { path } of anthropicUsageMockFiles(scenario)) {
        expect([...mocked.keys()]).toContain(path)
      }
    })

    it('leaves a status line that declares hosts but no token read unmocked', () => {
      const plain = new Map(
        desktopSessionFiles(scenario, SEED, { ...TOKEN_READER, readsClaudeToken: false }).map(
          (f) => [f.path, f.data],
        ),
      )
      expect(settings(plain).statusLine.command).toBe(`cat | bash ${CONFIG_DIR}/statusline.sh`)
      expect([...plain.keys()]).not.toContain('/home/user/.claude/.credentials.json')
    })
  })
})

describe('desktopSessionNetwork', () => {
  it('keeps a session with no status line, or one with no hosts, offline', () => {
    expect(desktopSessionNetwork(undefined)).toEqual({ networkHosts: [], rootCommand: null })
    expect(
      desktopSessionNetwork({ source: 'echo hi', interpreter: 'bash', networkHosts: [] }),
    ).toEqual({ networkHosts: [], rootCommand: null })
  })

  it("allows a status line's approved hosts", () => {
    expect(
      desktopSessionNetwork({ source: 'echo hi', interpreter: 'bash', networkHosts: ['wttr.in'] }),
    ).toEqual({ networkHosts: ['wttr.in'], rootCommand: null })
  })

  it('serves the mocked usage host on loopback instead of allowing it', () => {
    expect(
      desktopSessionNetwork({
        source: 'echo hi',
        interpreter: 'bash',
        networkHosts: ['api.anthropic.com', 'wttr.in'],
        readsClaudeToken: true,
      }),
    ).toEqual({ networkHosts: ['wttr.in'], rootCommand: anthropicUsageSetupScript() })
  })

  it.each(['api.anthropic.com', 'console.anthropic.com', 'claude.ai', 'claude.com'])(
    'refuses to let Desktop reach the real %s',
    (host) => {
      expect(() =>
        desktopSessionNetwork({ source: 'echo hi', interpreter: 'bash', networkHosts: [host] }),
      ).toThrow(/Anthropic host/)
    },
  )
})

describe('isAnthropicHost', () => {
  it("matches Anthropic's domains and their subdomains, and nothing that only looks like them", () => {
    expect(
      ['anthropic.com', 'api.anthropic.com', 'claude.ai', 'x.claude.com'].map(isAnthropicHost),
    ).toEqual([true, true, true, true])
    expect(['notanthropic.com', 'claude.ai.example.com', 'wttr.in'].map(isAnthropicHost)).toEqual([
      false,
      false,
      false,
    ])
  })
})

describe('stepFiles', () => {
  it('stages each input step as its own file, to be uploaded before any mod code runs', () => {
    const steps = [
      { type: 'text' as const, text: '/radar' },
      { type: 'text' as const, text: "look at [Image #1]; echo '$HOME'", submit: false },
    ]

    expect(stepFiles(steps)).toEqual([
      { path: stepTextPath(0), data: '/radar' },
      { path: stepTextPath(1), data: "look at [Image #1]; echo '$HOME'" },
    ])
    expect(stepTextPath(1)).toBe('/home/user/.statuslines/step-1.txt')
  })
})

describe('ENGINE_VERSION_COMMAND', () => {
  it('reads the version the template recorded, not anything the session wrote', () => {
    expect(ENGINE_VERSION_COMMAND).toBe(`cat ${SANDBOX_DESKTOP_ENGINE_VERSION}`)
  })
})

describe('transcript commands', () => {
  it('count the transcript lines and look for the canned reply', () => {
    expect(transcriptLinesCommand(scenario)).toBe(
      `cat ${CONFIG_DIR}/projects/*/*.jsonl 2>/dev/null | wc -l`,
    )
    expect(repliedCommand(scenario)).toBe(
      `grep -qsF '${cannedReply(scenario).text}' ${CONFIG_DIR}/projects/*/*.jsonl`,
    )
  })
})

describe('parseVersion', () => {
  it('reads one exact version', () => {
    expect(parseVersion('2.31226.1', 'Desktop')).toBe('2.31226.1')
    expect(parseVersion('2.1.295\n', 'engine')).toBe('2.1.295')
  })

  it.each([['2.1'], ['2.1.295\n2.1.296'], ['2.1.295-beta'], ['']])('refuses %j', (stdout) => {
    expect(() => parseVersion(stdout, 'engine')).toThrow(/engine version/)
  })
})
