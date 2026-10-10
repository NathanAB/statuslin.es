// biome-ignore-all lint/style/useNamingConvention: env var names are external contracts.
/**
 * SPIKE (throwaway, never merged): screenshot a mod in the real Claude Desktop for Linux, running
 * in an offline E2B sandbox from the `statuslines-desktop-spike` template on a 1440x900 Xvfb.
 * Desktop runs in gateway mode against the canned model server, so no sign-in is needed.
 *
 *   bun scripts/spikes/desktop-real.ts token-weather [--keep] [--tag run1] [--status-line file]
 *
 * Writes full and step screenshots to docs/research/desktop-real/<slug>.<tag>.*.png (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { CommandExitError, Sandbox } from 'e2b'
import curation from '@/mods/curation.json'
import { createGitHub } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'
import { SANDBOX_CLAUDE_CODE_BIN } from '@/render/e2b-template'
import { SANDBOX_PLUGINS_DIR, SANDBOX_WORK_DIR } from '@/render/mods/mod-sandbox'
import { feedScenario, feedStdin } from '@/render/mods/scenario-feed'
import {
  FEED_PLUGIN_DIR,
  SCRIPTED_PROMPT,
  sessionEnv,
  sessionFiles,
  setupCommand,
} from '@/render/mods/session'
import { DESKTOP_BOOT, DESKTOP_TEMPLATE_NAME } from './build-desktop-template'
import { capText, checkedPng, stagingE2bKey } from './e2b-shell'

const REPO_ROOT = join(import.meta.dirname, '../..')
const OUT_DIR = join(REPO_ROOT, 'docs/research/desktop-real')
const TARBALL_PATH = `${SANDBOX_WORK_DIR}/mod.tar.gz`
const PLUGIN_DIR = `${SANDBOX_PLUGINS_DIR}/mod`
const SANDBOX_TIMEOUT_MS = 15 * 60_000
const SESSION_CONFIG_DIR = '/home/user/session-home/.claude'
const STATUS_LINE_PATH = `${SESSION_CONFIG_DIR}/statusline.sh`
const X = 'export DISPLAY=:99; . /tmp/dbus.env 2>/dev/null;'
const CANNED_TEXT = 'The repo is clean and the tests pass.'

type CurationEntry = (typeof curation)[number] & {
  inputSteps?: { type: string; text: string; submit?: boolean }[]
}

function unpackCommand(path: string): string {
  const depth = path === '' ? 0 : path.split('/').length
  const member = path === '' ? '' : ` "$top/${path}"`
  return [
    `mkdir -p ${PLUGIN_DIR}`,
    `top="$(tar -tzf ${TARBALL_PATH} | head -n 1 | cut -d/ -f1)"`,
    `tar -xzf ${TARBALL_PATH} -C ${PLUGIN_DIR} --strip-components=${depth + 1}${member}`,
    `test -f ${PLUGIN_DIR}/.claude-plugin/plugin.json`,
  ].join(' && ')
}

export class Run {
  readonly timings: Record<string, number> = {}
  readonly log: string[] = []
  private readonly started = performance.now()

  constructor(
    readonly sandbox: Sandbox,
    readonly prefix: string,
  ) {}

  mark(name: string) {
    this.timings[name] = Math.round(performance.now() - this.started)
  }

  async sh(command: string, opts: { root?: boolean; timeoutMs?: number } = {}) {
    try {
      const out = await this.sandbox.commands.run(command, {
        user: opts.root ? 'root' : 'user',
        timeoutMs: opts.timeoutMs ?? 60_000,
      })
      return { ok: true, out: capText(out.stdout + out.stderr) }
    } catch (error) {
      if (!(error instanceof CommandExitError)) throw error
      return { ok: false, out: capText(error.stdout + error.stderr) }
    }
  }

  /** Polls a shell condition inside the sandbox; one round trip. */
  async until(label: string, condition: string, timeoutS: number) {
    const steps = Math.ceil(timeoutS / 0.2)
    const r = await this.sh(
      `${X} for i in $(seq 1 ${steps}); do (${condition}) >/dev/null 2>&1 && exit 0; sleep 0.2; done; exit 1`,
      { timeoutMs: (timeoutS + 30) * 1000 },
    )
    this.log.push(`${label}: ${r.ok ? 'ok' : 'TIMEOUT'}`)
    if (!r.ok) throw new Error(`timed out waiting for ${label}`)
  }

  async x(command: string) {
    const r = await this.sh(`${X} ${command}`)
    if (!r.ok) this.log.push(`x failed: ${command}: ${r.out}`)
    return r
  }

  async crop(name: string, r: { x: number; y: number; w: number; h: number }): Promise<string> {
    const remote = `/tmp/shot-${name}.png`
    await this.sh(
      `convert /tmp/shot-full.png -crop ${r.w * scale}x${r.h * scale}+${r.x * scale}+${r.y * scale} +repage -strip ${remote}`,
    )
    const bytes = await this.sandbox.files.read(remote, { format: 'bytes', user: 'user' })
    const file = join(OUT_DIR, `${this.prefix}.${name}.png`)
    writeFileSync(file, checkedPng(bytes))
    return file
  }

  async shot(name: string): Promise<string> {
    const remote = `/tmp/shot-${name}.png`
    await this.sh(`${X} import -window root -strip ${remote}`)
    const bytes = await this.sandbox.files.read(remote, { format: 'bytes', user: 'user' })
    const file = join(OUT_DIR, `${this.prefix}.${name}.png`)
    writeFileSync(file, checkedPng(bytes))
    return file
  }
}

/** True when a screen region is mostly near-black: the buttons the flow clicks, on a light page. */
let invertButtons = false
/** Device pixels per CSS pixel; every coordinate below is in 1440x900 CSS pixels. */
let scale = 1
const at = (x: number, y: number) => `${x * scale} ${y * scale}`
export const darkArea = (x: number, y: number, w: number, h: number) =>
  `test "$(import -window root -crop ${w * scale}x${h * scale}+${x * scale}+${y * scale} -colorspace Gray -format '%[fx:${invertButtons ? 'mean>0.8' : 'mean<0.2'}?1:0]' info:)" = 1`

const COMPOSER_Y = 841
const SEND_X = 1228
const SETTLE_MS = 3000
/** The AbovePrompt band sits between the transcript and the composer, at x 480..1248. */
const BAND_CROP = { x: 470, y: 765, w: 790, h: 52 }
/** A docked Pane sits on the right, beside the narrowed transcript. */
const PANE_CROP = { x: 1050, y: 40, w: 385, h: 855 }

export const desktopArgs = (noSandbox: boolean) => [
  '--password-store=gnome-libsecret',
  ...(noSandbox ? ['--no-sandbox'] : []),
  ...(scale === 1 ? [] : [`--force-device-scale-factor=${scale}`]),
]

/** Starts Xvfb and Desktop, gets past the gateway welcome and waits for the engine's preseed install. */
export async function bootDesktop(
  run: Run,
  opts: { noSandbox: boolean; dark: boolean; scale?: number },
) {
  invertButtons = opts.dark
  scale = opts.scale ?? 1
  const env = sessionEnv(feedScenario())
  const desktopEnv: Record<string, string> = {
    CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR ?? '',
    CLAUDE_CODE_PLUGIN_DIRS: `${FEED_PLUGIN_DIR}:${PLUGIN_DIR}`,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    SCREEN: `${1440 * scale}x${900 * scale}x24`,
  }
  const exports = Object.entries(desktopEnv)
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ')
  const args = desktopArgs(opts.noSandbox)
  if (opts.dark) {
    await run.sandbox.files.write(
      '/home/user/.config/Claude-3p/config.json',
      JSON.stringify({ userThemeMode: 'dark' }),
      {
        user: 'user',
      },
    )
  }
  const handle = await run.sandbox.commands.run(
    `env ${exports} ${DESKTOP_BOOT} ${args.join(' ')}`,
    {
      user: 'user',
      background: true,
      timeoutMs: 0,
    },
  )
  await handle.disconnect()
  await run.until('window', `xdotool search --onlyvisible --name '^Claude$'`, 60)
  await run.x(
    `w=$(xdotool search --onlyvisible --name '^Claude$' | head -1); xdotool windowmove $w 0 0 windowsize $w ${1440 * scale} ${900 * scale}`,
  )
  run.mark('window')
  await run.until('welcome', darkArea(560, 522, 40, 30), 40)
  await run.x(`xdotool mousemove ${at(580, 537)} click 1`)
  run.mark('booted')

  await run.until(
    'engine installed',
    'ls /home/user/.config/Claude-3p/claude-code/*/*/.verified',
    30,
  )
  run.mark('engine')
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: throwaway spike driver, one linear script.
async function desktopMod(
  entry: CurationEntry,
  apiKey: string,
  opts: {
    keep: boolean
    tag: string
    statusLine: string | undefined
    noSandbox: boolean
    dark: boolean
    template: string
    warm: boolean
    scale: number
  },
) {
  const scenario = feedScenario()
  const tarball = await createGitHub().tarball(entry.repoUrl, entry.commitSha)
  const created = performance.now()
  const sandbox = await Sandbox.create(opts.template, {
    apiKey,
    allowInternetAccess: false,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    requestTimeoutMs: 60_000,
    secure: true,
  })
  const run = new Run(sandbox, `${entry.pluginName}.${opts.tag}`)
  const result: Record<string, unknown> = { slug: entry.pluginName, sandboxId: sandbox.sandboxId }
  const shots: string[] = []
  try {
    run.mark('sandbox')
    await sandbox.files.write(
      [
        {
          path: TARBALL_PATH,
          data: tarball.buffer.slice(
            tarball.byteOffset,
            tarball.byteOffset + tarball.byteLength,
          ) as ArrayBuffer,
        },
      ],
      { user: 'user' },
    )
    const unpacked = await run.sh(unpackCommand(entry.path))
    if (!unpacked.ok) throw new Error(`unpack failed: ${unpacked.out}`)
    const version = await run.sh(`${SANDBOX_CLAUDE_CODE_BIN} --version`)
    await sandbox.files.write(
      sessionFiles(scenario, {
        target: entry.pluginName,
        nowMs: Date.now(),
        claudeCodeVersion: version.out.trim().split(' ')[0] ?? 'unknown',
      }),
      { user: 'user' },
    )
    if (opts.statusLine !== undefined) {
      await sandbox.files.write(
        [
          { path: STATUS_LINE_PATH, data: opts.statusLine },
          {
            path: `${SESSION_CONFIG_DIR}/settings.json`,
            data: JSON.stringify({
              statusLine: { type: 'command', command: `bash ${STATUS_LINE_PATH}` },
            }),
          },
        ],
        { user: 'user' },
      )
    }
    const setup = await run.sh(setupCommand(scenario))
    if (!setup.ok) throw new Error(`setup failed: ${setup.out}`)
    run.mark('setup')

    invertButtons = opts.dark
    scale = opts.scale
    const args = desktopArgs(opts.noSandbox)
    if (opts.warm) await run.x(`xdotool mousemove ${at(1439, 450)}`)
    else await bootDesktop(run, opts)
    const workspace = feedStdin(scenario).workspace.current_dir
    const link = `claude://code/new?folder=${encodeURIComponent(workspace)}&q=${encodeURIComponent(SCRIPTED_PROMPT.text)}`
    for (let attempt = 0; attempt < 4; attempt++) {
      await run.x(`timeout 15 claude-desktop ${args.join(' ')} '${link}' >/tmp/deeplink.log 2>&1`)
      try {
        await run.until(`trust dialog (attempt ${attempt + 1})`, darkArea(784, 502, 6, 18), 4)
        break
      } catch (error) {
        if (attempt === 3) throw error
      }
    }
    await run.x(`xdotool mousemove ${at(840, 511)} click 1`)
    run.mark('trusted')
    const replied = `grep -rqs '${CANNED_TEXT}' ${SESSION_CONFIG_DIR}/projects`
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, 1500))
      await run.x(
        `${darkArea(877, 509, 6, 16)} && xdotool mousemove ${at(898, 517)} click 1 && sleep 0.5`,
      )
      await run.x(`xdotool mousemove ${at(SEND_X, COMPOSER_Y)} click 1`)
      try {
        await run.until(`reply (attempt ${attempt + 1})`, replied, 15)
        break
      } catch (error) {
        if (attempt === 2) throw error
        shots.push(await run.shot(`retry-${attempt + 1}`))
      }
    }
    run.mark('replied')
    for (const step of entry.inputSteps ?? []) {
      await run.x(`xdotool mousemove ${at(800, COMPOSER_Y)} click 1`)
      await run.x(`xdotool type --delay 40 '${step.text.replaceAll("'", '')}'`)
      await new Promise((r) => setTimeout(r, 800))
      if (step.submit !== false) await run.x(`xdotool mousemove ${at(SEND_X, COMPOSER_Y)} click 1`)
      await new Promise((r) => setTimeout(r, 1500))
    }
    await run.x(`xdotool mousemove ${at(900, 600)} click 1 mousemove ${at(1439, 450)}`)
    await new Promise((r) => setTimeout(r, SETTLE_MS))
    shots.push(await run.shot('full'))
    shots.push(await run.crop('band', BAND_CROP))
    if ((entry.inputSteps ?? []).length > 0) shots.push(await run.crop('pane', PANE_CROP))
    run.mark('rendered')
    result.log = run.log
    if (opts.keep) return { ...result, timings: run.timings, shots, kept: true }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    shots.push(await run.shot('error').catch(() => 'no shot'))
  } finally {
    if (!opts.keep) await sandbox.kill().catch(() => {})
    run.mark('end')
  }
  result.totalMs = Math.round(performance.now() - created)
  return { ...result, timings: run.timings, shots, log: run.log }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      keep: { type: 'boolean', default: false },
      tag: { type: 'string', default: 'run' },
      'status-line': { type: 'string' },
      'no-sandbox': { type: 'boolean', default: false },
      dark: { type: 'boolean', default: false },
      template: { type: 'string', default: DESKTOP_TEMPLATE_NAME },
      warm: { type: 'boolean', default: false },
      scale: { type: 'string', default: '1' },
    },
    allowPositionals: true,
    strict: true,
  })
  const apiKey = stagingE2bKey()
  mkdirSync(OUT_DIR, { recursive: true })
  const statusLine =
    values['status-line'] === undefined ? undefined : readFileSync(values['status-line'], 'utf8')
  for (const slug of positionals) {
    const entry = (curation as CurationEntry[]).find((e) => e.pluginName === slug)
    if (!entry) throw new Error(`no curated mod "${slug}"`)
    const result = await desktopMod(entry, apiKey, {
      keep: values.keep,
      tag: values.tag,
      statusLine,
      noSandbox: values['no-sandbox'],
      dark: values.dark,
      template: values.template,
      warm: values.warm,
      scale: Number(values.scale),
    })
    const file = join(OUT_DIR, `${slug}.${values.tag}.json`)
    writeFileSync(file, JSON.stringify(result, null, 2))
    console.log(terminalLine(JSON.stringify(result).slice(0, 2000)))
  }
}

if (import.meta.main)
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(
        terminalLine(`[desktop-real] ${error instanceof Error ? error.message : error}`),
      )
      process.exit(1)
    },
  )
