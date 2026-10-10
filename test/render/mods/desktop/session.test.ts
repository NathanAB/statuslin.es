import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SANDBOX_DESKTOP_BOOT, SANDBOX_DESKTOP_ENGINE_VERSION } from '@/render/e2b-template'
import {
  bootCommand,
  deepLink,
  desktopEnv,
  desktopSessionFiles,
  ENGINE_VERSION_COMMAND,
  FIT_WINDOW_COMMAND,
  parseVersion,
  repliedCommand,
  stepFiles,
  stepTextPath,
  transcriptLinesCommand,
} from '@/render/mods/desktop/session'
import { cannedReply, feedScenario } from '@/render/mods/scenario-feed'
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
    expect(desktopEnv(scenario, null)).toMatchObject({ SCREEN: '2200x1280x24', TZ: 'UTC' })
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
    expect(FIT_WINDOW_COMMAND).toContain('windowsize "$w" 2200 1280')
    expect(FIT_WINDOW_COMMAND).toContain(
      `xdotool getwindowgeometry --shell "$w" | grep -E '^(X|Y|WIDTH|HEIGHT)=' | tr '\\n' ' '`,
    )
    expect(FIT_WINDOW_COMMAND).toMatch(/= "X=0 Y=0 WIDTH=2200 HEIGHT=1280 "$/)
  })
})

describe('deepLink', () => {
  it('opens a Code session on the workspace with the scripted prompt typed', () => {
    expect(deepLink(scenario)).toBe('claude://code/new?folder=%2Fhome%2Fuser%2Fapp&q=hello')
  })
})

describe('desktopSessionFiles', () => {
  const files = new Map(desktopSessionFiles(scenario, SEED).map((f) => [f.path, f.data]))

  it('writes the committed sample status line and points the settings at it', () => {
    const script = `${CONFIG_DIR}/statusline.sh`

    expect(files.get(script)).toBe(
      readFileSync('src/render/mods/desktop/sandbox/statusline.sh', 'utf8'),
    )
    expect(JSON.parse(String(files.get(`${CONFIG_DIR}/settings.json`)))).toEqual({
      statusLine: { type: 'command', command: `bash ${script}` },
    })
  })

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
