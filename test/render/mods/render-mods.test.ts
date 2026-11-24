import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { InputStep } from '@/mods/curation'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { RECORDING_MAX_ROW_BYTES } from '@/render/mods/bound-recording'
import { cropModPreview } from '@/render/mods/crop'
import { FAKE_THEME_SHOT, FakeDesktopRecorder } from '@/render/mods/desktop/fake-recorder'
import type { DesktopRecorder, DesktopThemeRequest } from '@/render/mods/desktop/types'
import { DesktopThemeRefused } from '@/render/mods/desktop/window-shot'
import { FakeModRecorder } from '@/render/mods/fake-recorder'
import type { ModRecorder, ModSceneRequest, Recording, RecordRequest } from '@/render/mods/recorder'
import { DEFAULT_TERMINAL_SETUP, type TerminalSetup } from '@/render/mods/terminal'
import { insertPendingSubmission } from '@/submissions/record'
import { renderMods } from '../../../scripts/render-mods'
import {
  addDesktopTheme,
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  REPO_URL,
  SEEDED_PREVIEW,
  SEEDED_THEME_PREVIEW,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../../mods/seed-mods'
import baseline from './fixtures/baseline.json'
import skins from './fixtures/skins.json'
import tokenWeather from './fixtures/token-weather.json'

const TARBALL = new Uint8Array([31, 139, 8, 0])

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

let seeded = 0
const nextSha = () => sha('0123456789abcdef'[seeded++ % 16] ?? '0')

interface Seed {
  status?: schema.ModStatus
  commitSha?: string
  rendered?: boolean
  path?: string
  inputSteps?: InputStep[]
  terminal?: TerminalSetup | null
}

async function seedMod(
  slug: string,
  {
    status = 'draft',
    commitSha = nextSha(),
    rendered = false,
    path = '',
    inputSteps = [],
    terminal = null,
  }: Seed = {},
) {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, {
    commitSha,
    versionNumber: 1,
    rendered,
    path,
  })
  await db
    .update(schema.modVersions)
    .set({ inputSteps, terminal })
    .where(eq(schema.modVersions.id, versionId))
  await setCurrentVersion(db, modId, versionId)
  return versionId
}

async function storedPreviews(versionId: string) {
  return db
    .select({
      scenarioKey: schema.modPreviews.scenarioKey,
      segments: schema.modPreviews.segments,
      claudeCodeVersion: schema.modPreviews.claudeCodeVersion,
    })
    .from(schema.modPreviews)
    .where(eq(schema.modPreviews.modVersionId, versionId))
}

async function storedDesktopPreviews(versionId: string) {
  return db
    .select({
      scenarioKey: schema.modDesktopPreviews.scenarioKey,
      kind: schema.modDesktopPreviews.kind,
      png: schema.modDesktopPreviews.png,
      width: schema.modDesktopPreviews.width,
      height: schema.modDesktopPreviews.height,
      cardPng: schema.modDesktopPreviews.cardPng,
      cardWidth: schema.modDesktopPreviews.cardWidth,
      cardHeight: schema.modDesktopPreviews.cardHeight,
      desktopVersion: schema.modDesktopPreviews.desktopVersion,
      engineVersion: schema.modDesktopPreviews.engineVersion,
    })
    .from(schema.modDesktopPreviews)
    .where(eq(schema.modDesktopPreviews.modVersionId, versionId))
}

function run(
  recorder: ModRecorder,
  options: { slug?: string } = {},
  desktopRecorder: DesktopRecorder = new FakeDesktopRecorder(),
) {
  const lines: string[] = []
  const tarballs: string[] = []
  const exitCode = renderMods(options, {
    db,
    recorder,
    desktopRecorder,
    fetchPlugin: async ({ repoUrl, commitSha }) => {
      tarballs.push(`${repoUrl}@${commitSha}`)
      return TARBALL
    },
    log: (line) => lines.push(line),
  })
  return { exitCode, lines, tarballs }
}

const modRequests = (requests: RecordRequest[]) =>
  requests.filter((r): r is ModSceneRequest => r.scene === 'mod' && r.mod !== null)
const baselineRequests = (requests: RecordRequest[]) =>
  requests.filter((r): r is ModSceneRequest => r.scene === 'mod' && r.mod === null)

/** Wraps a recorder to fail for named plugins, or report a Claude Code version per plugin. */
interface Script {
  failFor?: string[]
  /** Claude Code version each plugin's recording reports. */
  versions?: Record<string, string>
  /** Claude Code version each successive baseline recording reports. */
  baselineVersions?: string[]
}

function scriptedRecorder(
  inner: ModRecorder,
  { failFor = [], versions = {}, baselineVersions = [] }: Script = {},
): ModRecorder & { requests: RecordRequest[] } {
  const requests: RecordRequest[] = []
  return {
    requests,
    async record(request): Promise<Recording> {
      requests.push(request)
      const name = request.mod?.pluginName
      if (name && failFor.includes(name)) throw new Error(`sandbox for ${name} died`)
      const recording = await inner.record(request)
      const version = name ? versions[name] : baselineVersions.shift()
      return version ? { ...recording, claudeCodeVersion: version } : recording
    },
  }
}

describe('renderMods', () => {
  it('stores the crop of a rendered mod as AnsiSegment[] with its Claude Code version', async () => {
    const versionId = await seedMod('token-weather', { rendered: true })
    const recorder = new FakeModRecorder({ baseline, mods: { 'token-weather': tokenWeather } })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    const expected = cropModPreview(baseline, tokenWeather)
    if (expected.kind !== 'rendered') throw new Error('fixture should crop to a preview')
    const stored = await storedPreviews(versionId)
    expect(stored).toEqual([
      {
        scenarioKey: MOD_SCENARIO_KEY,
        segments: expected.segments,
        claudeCodeVersion: '0.0.0-fake',
      },
    ])
    for (const segment of stored[0]?.segments ?? []) expect(typeof segment.text).toBe('string')
    expect(lines).toContain('rendered token-weather in the terminal')
  })

  it('stores an empty preview for a crop with no rows of its own, replacing the earlier one', async () => {
    const versionId = await seedMod('statusline-anywhere', { rendered: true })
    const recorder = new FakeModRecorder({ baseline })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(await storedPreviews(versionId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, segments: [], claudeCodeVersion: '0.0.0-fake' },
    ])
    expect(lines).toContain('drew nothing statusline-anywhere in the terminal')
  })

  it('keeps the earlier preview and exits non-zero when a recording fails', async () => {
    const brokenId = await seedMod('skins', { rendered: true })
    const fineId = await seedMod('token-weather')
    const recorder = scriptedRecorder(
      new FakeModRecorder({ baseline, mods: { skins, 'token-weather': tokenWeather } }),
      { failFor: ['skins'] },
    )

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(await storedPreviews(brokenId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, ...SEEDED_PREVIEW },
    ])
    expect(await storedPreviews(fineId)).toHaveLength(1)
    expect(lines).toContain('failed skins in the terminal: sandbox for skins died')
  })

  it('fails a mod whose stored input steps do not parse on both surfaces, without recording it', async () => {
    const malformed = [{ type: 'key', key: 'ctrl+c' }] as unknown as InputStep[]
    await seedMod('radar', { inputSteps: malformed })
    const recorder = new FakeModRecorder({ baseline })
    const desktopRecorder = new FakeDesktopRecorder()

    const { exitCode, lines } = run(recorder, {}, desktopRecorder)

    expect(await exitCode).toBe(1)
    expect(modRequests(recorder.requests)).toEqual([])
    expect(desktopRecorder.requests).toEqual([])
    expect(lines).toEqual([
      expect.stringMatching(/^failed radar in the terminal: /),
      expect.stringMatching(/^failed radar in Claude Desktop: /),
    ])
  })

  it('fails a mod whose stored terminal does not parse on both surfaces, without recording it', async () => {
    const malformed = { cols: 999 } as unknown as TerminalSetup
    await seedMod('radar', { terminal: malformed })
    const recorder = new FakeModRecorder({ baseline })
    const desktopRecorder = new FakeDesktopRecorder()

    const { exitCode, lines } = run(recorder, {}, desktopRecorder)

    expect(await exitCode).toBe(1)
    expect(recorder.requests).toEqual([])
    expect(desktopRecorder.requests).toEqual([])
    expect(lines).toEqual([
      expect.stringMatching(/^failed radar in the terminal: /),
      expect.stringMatching(/^failed radar in Claude Desktop: /),
    ])
  })

  it('records each version with its tarball, path, plugin name and input steps', async () => {
    const inputSteps: InputStep[] = [{ type: 'text', text: '/radar', submit: false }]
    await seedMod('radar', { commitSha: sha('d'), path: 'mods/radar', inputSteps })
    const recorder = new FakeModRecorder({ baseline })

    const { exitCode, tarballs } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(tarballs).toEqual([`${REPO_URL}@${sha('d')}`])
    expect(modRequests(recorder.requests)).toEqual([
      {
        scene: 'mod',
        mod: { source: { tarball: TARBALL, path: 'mods/radar' }, pluginName: 'radar' },
        inputSteps,
        terminal: DEFAULT_TERMINAL_SETUP,
      },
    ])
  })

  it("renders a mod's newest version beside its current one and leaves the current one live", async () => {
    const currentId = await seedMod('skins', { status: 'published', rendered: true })
    const [mod] = await db.select({ id: schema.mods.id }).from(schema.mods)
    const modId = mod?.id as string
    const skippedId = await addVersion(db, modId, {
      commitSha: sha('e'),
      versionNumber: 2,
      rendered: false,
    })
    const newestId = await addVersion(db, modId, {
      commitSha: sha('f'),
      versionNumber: 3,
      rendered: false,
    })
    const recorder = new FakeModRecorder({ baseline, mods: { skins } })

    const { exitCode, lines, tarballs } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(tarballs).toHaveLength(2)
    expect(tarballs).toContain(`${REPO_URL}@${sha('f')}`)
    expect(tarballs).not.toContain(`${REPO_URL}@${sha('e')}`)
    expect(lines).toContain('rendered skins in the terminal')
    expect(lines).toContain('rendered skins v3 (not current) in the terminal')
    expect(await storedPreviews(newestId)).toHaveLength(1)
    expect(await storedPreviews(skippedId)).toEqual([])
    const [after] = await db.select().from(schema.mods)
    expect(after?.currentVersionId).toBe(currentId)
  })

  it('records the baseline once for a run of several mods', async () => {
    await seedMod('skins')
    await seedMod('token-weather')
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder).exitCode).toBe(0)

    expect(baselineRequests(recorder.requests)).toEqual([
      { scene: 'mod', mod: null, inputSteps: [], terminal: DEFAULT_TERMINAL_SETUP },
    ])
    expect(modRequests(recorder.requests)).toHaveLength(2)
  })

  it("records the baseline with the mod's input steps, once per distinct list", async () => {
    const inputSteps: InputStep[] = [{ type: 'text', text: 'Run the tests again' }]
    await seedMod('skins', { inputSteps })
    await seedMod('token-weather', { inputSteps })
    await seedMod('radar')
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder).exitCode).toBe(0)

    const baselines = baselineRequests(recorder.requests)
    expect(baselines).toHaveLength(2)
    expect(baselines).toEqual(
      expect.arrayContaining([
        { scene: 'mod', mod: null, inputSteps, terminal: DEFAULT_TERMINAL_SETUP },
        { scene: 'mod', mod: null, inputSteps: [], terminal: DEFAULT_TERMINAL_SETUP },
      ]),
    )
  })

  it('records each mod in its own terminal setup, with one baseline per setup', async () => {
    const wide = { cols: 120, fullscreen: true }
    await seedMod('skins', { terminal: wide })
    await seedMod('token-weather', { terminal: wide })
    await seedMod('radar')
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder).exitCode).toBe(0)

    const baselines = baselineRequests(recorder.requests)
    expect(baselines).toHaveLength(2)
    expect(baselines).toEqual(
      expect.arrayContaining([
        { scene: 'mod', mod: null, inputSteps: [], terminal: wide },
        { scene: 'mod', mod: null, inputSteps: [], terminal: DEFAULT_TERMINAL_SETUP },
      ]),
    )
    const setups = Object.fromEntries(
      modRequests(recorder.requests).map((r) => [r.mod?.pluginName, r.terminal]),
    )
    expect(setups).toEqual({ skins: wide, 'token-weather': wide, radar: DEFAULT_TERMINAL_SETUP })
  })

  it('re-records the baseline when a mod ran a different Claude Code version', async () => {
    await seedMod('skins')
    const newerId = await seedMod('token-weather')
    const recorder = scriptedRecorder(
      new FakeModRecorder({ baseline, mods: { skins, 'token-weather': tokenWeather } }),
      {
        versions: { skins: '2.1.296', 'token-weather': '2.1.297' },
        baselineVersions: ['2.1.296', '2.1.297'],
      },
    )

    expect(await run(recorder).exitCode).toBe(0)

    expect(baselineRequests(recorder.requests)).toHaveLength(2)
    expect((await storedPreviews(newerId))[0]?.claudeCodeVersion).toBe('2.1.297')
  })

  it('refuses an oversized recording and keeps the earlier preview', async () => {
    const versionId = await seedMod('flood', { rendered: true })
    const flood = [...baseline]
    flood[0] = 'x'.repeat(RECORDING_MAX_ROW_BYTES + 1)
    const recorder = new FakeModRecorder({ baseline, mods: { flood } })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(await storedPreviews(versionId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, ...SEEDED_PREVIEW },
    ])
    expect(lines).toContain(
      `failed flood in the terminal: recording row 1 is over the ${RECORDING_MAX_ROW_BYTES}-byte limit`,
    )
  })

  it('renders only the mod named by --slug', async () => {
    await seedMod('skins')
    const otherId = await seedMod('token-weather')
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder, { slug: 'skins' }).exitCode).toBe(0)

    expect(modRequests(recorder.requests).map((r) => r.mod?.pluginName)).toEqual(['skins'])
    expect(await storedPreviews(otherId)).toEqual([])
  })

  it('skips a submitted version that was rejected or replaced, and renders a pending one', async () => {
    await db
      .insert(schema.user)
      .values({ id: 'ada', name: 'Ada', email: 'ada@test.com' })
      .onConflictDoNothing()
    const rejected = await seedMod('skins')
    const pending = await seedMod('token-weather')
    for (const [versionId, status] of [
      [rejected, 'rejected'],
      [pending, 'pending'],
    ] as const) {
      await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'ada' })
      await db
        .update(schema.submissions)
        .set({ status })
        .where(eq(schema.submissions.id, versionId))
    }
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder).exitCode).toBe(0)

    expect(modRequests(recorder.requests).map((r) => r.mod?.pluginName)).toEqual(['token-weather'])
  })

  it('skips a removed mod', async () => {
    await seedMod('skins', { status: 'removed' })
    await seedMod('token-weather', { status: 'published' })
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(modRequests(recorder.requests).map((r) => r.mod?.pluginName)).toEqual(['token-weather'])
    expect(lines.join('\n')).not.toContain('skins')
  })

  it('escapes and caps each printed line', async () => {
    await seedMod('skins')
    const reason = `\u001b]52;c;${'A'.repeat(10_000)}\u0007`
    const recorder: ModRecorder = {
      async record(request) {
        if (request.mod) throw new Error(reason)
        return { rows: baseline, claudeCodeVersion: '2.1.296' }
      },
    }

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(
      /^failed skins in the terminal: \\u001b\]52;c;A+… \(\d+ more characters\)$/,
    )
    expect(lines[0]?.length).toBeLessThanOrEqual(500)
  })

  it('exits non-zero when --slug names no mod', async () => {
    await seedMod('skins')
    const recorder = new FakeModRecorder({ baseline })

    const { exitCode, lines } = run(recorder, { slug: 'nope' })

    expect(await exitCode).toBe(1)
    expect(recorder.requests).toEqual([])
    expect(lines).toContain('no mod with slug "nope" has a current version')
  })
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7])
const CARD_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 8])
const SHOT = { png: PNG, width: 790, height: 52, card: { png: CARD_PNG, width: 790, height: 40 } }
/** SHOT as its row stores it. */
const STORED_SHOT = {
  png: PNG,
  width: 790,
  height: 52,
  cardPng: CARD_PNG,
  cardWidth: 790,
  cardHeight: 40,
}
const FAKE_DESKTOP = { desktopVersion: '0.0.0-fake', engineVersion: '0.0.0-fake' }
const STORED_NOTHING = {
  scenarioKey: MOD_SCENARIO_KEY,
  kind: 'nothing',
  png: null,
  width: null,
  height: null,
  cardPng: null,
  cardWidth: null,
  cardHeight: null,
  ...FAKE_DESKTOP,
}

async function seedDesktopShot(versionId: string) {
  await db.insert(schema.modDesktopPreviews).values({
    modVersionId: versionId,
    scenarioKey: MOD_SCENARIO_KEY,
    kind: 'shot',
    ...STORED_SHOT,
    desktopVersion: '1.0.0',
    engineVersion: '2.1.0',
  })
}

function failingDesktop(pluginName: string): DesktopRecorder {
  const inner = new FakeDesktopRecorder()
  return {
    async record(request) {
      if (request.mod.pluginName === pluginName) throw new Error(`desktop for ${pluginName} died`)
      return inner.record(request)
    },
    recordTheme: (request) => inner.recordTheme(request),
  }
}

describe('renderMods in Claude Desktop', () => {
  const terminal = () =>
    new FakeModRecorder({ baseline, mods: { skins, 'token-weather': tokenWeather } })

  it('stores a shot with its PNG, its card PNG, their CSS sizes and the versions', async () => {
    const versionId = await seedMod('token-weather')

    const { exitCode, lines } = run(
      terminal(),
      {},
      new FakeDesktopRecorder({ 'token-weather': SHOT }),
    )

    expect(await exitCode).toBe(0)
    expect(await storedDesktopPreviews(versionId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, kind: 'shot', ...STORED_SHOT, ...FAKE_DESKTOP },
    ])
    expect(lines).toEqual([
      'rendered token-weather in the terminal',
      'rendered token-weather in Claude Desktop',
    ])
  })

  it('stores that a mod draws nothing there, replacing an earlier shot', async () => {
    const versionId = await seedMod('token-weather')
    await seedDesktopShot(versionId)

    const { exitCode, lines } = run(terminal())

    expect(await exitCode).toBe(0)
    expect(await storedDesktopPreviews(versionId)).toEqual([STORED_NOTHING])
    expect(lines).toContain('drew nothing token-weather in Claude Desktop')
  })

  it('asks for the mod with its input steps', async () => {
    const inputSteps: InputStep[] = [{ type: 'text', text: '/radar' }]
    await seedMod('radar', { path: 'mods/radar', inputSteps })
    const desktopRecorder = new FakeDesktopRecorder()

    expect(await run(new FakeModRecorder({ baseline }), {}, desktopRecorder).exitCode).toBe(0)

    expect(desktopRecorder.requests).toEqual([
      {
        mod: { source: { tarball: TARBALL, path: 'mods/radar' }, pluginName: 'radar' },
        inputSteps,
      },
    ])
  })

  it('keeps the earlier Desktop result and still stores the terminal when Desktop fails', async () => {
    const versionId = await seedMod('skins')
    await seedDesktopShot(versionId)

    const { exitCode, lines } = run(terminal(), {}, failingDesktop('skins'))

    expect(await exitCode).toBe(1)
    expect(await storedDesktopPreviews(versionId)).toMatchObject([{ kind: 'shot', ...STORED_SHOT }])
    expect((await storedPreviews(versionId))[0]?.claudeCodeVersion).toBe('0.0.0-fake')
    expect(lines).toEqual([
      'rendered skins in the terminal',
      'failed skins in Claude Desktop: desktop for skins died',
    ])
  })

  it('still stores the Desktop result when the terminal fails', async () => {
    const versionId = await seedMod('skins', { rendered: true })
    const recorder = scriptedRecorder(terminal(), { failFor: ['skins'] })

    const { exitCode, lines } = run(recorder, {}, new FakeDesktopRecorder({ skins: SHOT }))

    expect(await exitCode).toBe(1)
    expect(await storedPreviews(versionId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, ...SEEDED_PREVIEW },
    ])
    expect(await storedDesktopPreviews(versionId)).toMatchObject([{ kind: 'shot' }])
    expect(lines).toEqual([
      'failed skins in the terminal: sandbox for skins died',
      'rendered skins in Claude Desktop',
    ])
  })
})

const RESET = '\u001b[0m'
/** Each theme's screen opens with the logo in its own colour, so a stored preview names its theme. */
const DRACULA = [`\u001b[0;38;2;189;147;249m▐▛███▜▌${RESET} Claude Code`, '❯']
const NORD = [`\u001b[0;38;2;136;192;208m▐▛███▜▌${RESET} Claude Code`, '❯']
const themeSegments = (fg: string) => [
  { text: '▐▛███▜▌', fg, bg: null, bold: false, italic: false, underline: false },
  { text: ' Claude Code\n❯', fg: null, bg: null, bold: false, italic: false, underline: false },
]
const DRACULA_PREVIEW = {
  segments: themeSegments('rgb(189, 147, 249)'),
  claudeCodeVersion: '0.0.0-fake',
}
const NORD_PREVIEW = {
  segments: themeSegments('rgb(136, 192, 208)'),
  claudeCodeVersion: '0.0.0-fake',
}

async function storedThemePreviews(versionId: string) {
  const rows = await db
    .select({
      key: schema.modThemes.key,
      segments: schema.modThemePreviews.segments,
      claudeCodeVersion: schema.modThemePreviews.claudeCodeVersion,
    })
    .from(schema.modThemes)
    .innerJoin(schema.modThemePreviews, eq(schema.modThemePreviews.themeId, schema.modThemes.id))
    .where(eq(schema.modThemes.modVersionId, versionId))
  return Object.fromEntries(rows.map(({ key, ...preview }) => [key, preview]))
}

const themeRequests = (requests: RecordRequest[]) =>
  requests
    .filter((r) => r.scene === 'theme' && r.theme !== null)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
const themeBaselineRequests = (requests: RecordRequest[]) =>
  requests.filter((r) => r.scene === 'theme' && r.mod === null)

function failingTheme(inner: ModRecorder, theme: string): ModRecorder {
  return {
    async record(request) {
      if (request.scene === 'theme' && request.theme === theme) {
        throw new Error(`sandbox for ${theme} died`)
      }
      return inner.record(request)
    },
  }
}

describe('renderMods for the themes a plugin carries', () => {
  const themed = () =>
    new FakeModRecorder({
      baseline,
      themes: { 'custom:pack:dracula': DRACULA, 'custom:pack:nord': NORD },
    })

  it("records each theme in the theme scene with the version's plugin, not the mod's steps or terminal", async () => {
    const inputSteps: InputStep[] = [{ type: 'text', text: '/pack' }]
    const wide = { cols: 120, fullscreen: true }
    const versionId = await seedMod('pack', { path: 'themes/pack', inputSteps, terminal: wide })
    await addTheme(db, versionId, { key: 'dracula', rendered: false })
    await addTheme(db, versionId, { key: 'nord', rendered: false })
    const recorder = themed()

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    const mod = { source: { tarball: TARBALL, path: 'themes/pack' }, pluginName: 'pack' }
    expect(themeRequests(recorder.requests)).toEqual([
      { scene: 'theme', mod, theme: 'custom:pack:dracula' },
      { scene: 'theme', mod, theme: 'custom:pack:nord' },
    ])
    expect(await storedThemePreviews(versionId)).toEqual({
      dracula: DRACULA_PREVIEW,
      nord: NORD_PREVIEW,
    })
    expect(lines).toContain('rendered pack theme dracula in the terminal')
    expect(lines).toContain('rendered pack theme nord in the terminal')
  })

  it('compares themes against one baseline of the theme scene with no plugin and no theme', async () => {
    for (const [slug, key] of [
      ['pack', 'dracula'],
      ['other-pack', 'nord'],
    ] as const) {
      const versionId = await seedMod(slug, { inputSteps: [{ type: 'text', text: `/${slug}` }] })
      await addTheme(db, versionId, { key, rendered: false })
    }
    const recorder = new FakeModRecorder({
      baseline,
      themes: { 'custom:pack:dracula': DRACULA, 'custom:other-pack:nord': NORD },
    })

    expect(await run(recorder).exitCode).toBe(0)

    expect(themeBaselineRequests(recorder.requests)).toEqual([
      { scene: 'theme', mod: null, theme: null },
    ])
  })

  it('records no theme baseline in a run with no themes to record', async () => {
    await seedMod('pack')
    const recorder = themed()

    expect(await run(recorder).exitCode).toBe(0)

    expect(recorder.requests.filter((r) => r.scene === 'theme')).toEqual([])
  })

  it('skips a theme that already has a preview on a full run', async () => {
    const versionId = await seedMod('pack')
    await addTheme(db, versionId, { key: 'dracula' })
    await addTheme(db, versionId, { key: 'nord', rendered: false })
    const recorder = themed()

    expect(await run(recorder).exitCode).toBe(0)

    expect(themeRequests(recorder.requests)).toEqual([
      {
        scene: 'theme',
        mod: expect.objectContaining({ pluginName: 'pack' }),
        theme: 'custom:pack:nord',
      },
    ])
    expect(await storedThemePreviews(versionId)).toEqual({
      dracula: SEEDED_THEME_PREVIEW,
      nord: NORD_PREVIEW,
    })
  })

  it('re-records every theme of the mod --slug names, replacing the earlier preview', async () => {
    const versionId = await seedMod('pack')
    await addTheme(db, versionId, { key: 'dracula' })
    await addTheme(db, versionId, { key: 'nord' })
    const recorder = themed()

    expect(await run(recorder, { slug: 'pack' }).exitCode).toBe(0)

    expect(await storedThemePreviews(versionId)).toEqual({
      dracula: DRACULA_PREVIEW,
      nord: NORD_PREVIEW,
    })
  })

  it("stores the other themes and the mod's own previews when one theme fails", async () => {
    const versionId = await seedMod('pack')
    await addTheme(db, versionId, { key: 'dracula', rendered: false })
    await addTheme(db, versionId, { key: 'nord', rendered: false })
    const recorder = failingTheme(themed(), 'custom:pack:dracula')

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(await storedThemePreviews(versionId)).toEqual({ nord: NORD_PREVIEW })
    expect(await storedPreviews(versionId)).toHaveLength(1)
    expect(await storedDesktopPreviews(versionId)).toHaveLength(1)
    expect(lines).toContain(
      'failed pack theme dracula in the terminal: sandbox for custom:pack:dracula died',
    )
    expect(lines).toContain('rendered pack theme nord in the terminal')
  })

  it('refuses a theme that records the same as a session with no theme', async () => {
    const versionId = await seedMod('pack')
    await addTheme(db, versionId, { key: 'ignored', rendered: false })
    await addTheme(db, versionId, { key: 'nord', rendered: false })
    // The baseline's screen with another turn time and clock, which the preview masks.
    const unthemed = baseline.map((row) =>
      row.replace('Churned for 0s · done 9:48', 'Baked for 7s · done 10:02'),
    )
    const recorder = new FakeModRecorder({
      baseline,
      themes: { 'custom:pack:ignored': unthemed, 'custom:pack:nord': NORD },
    })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(await storedThemePreviews(versionId)).toEqual({ nord: NORD_PREVIEW })
    expect(lines).toContain(
      "failed pack theme ignored in the terminal: looks the same as a session with no theme, so the theme setting likely didn't apply",
    )
    expect(lines).toContain('rendered pack theme nord in the terminal')
  })

  it('removes the earlier preview of a theme that now records the same as no theme', async () => {
    const versionId = await seedMod('pack')
    await addTheme(db, versionId, { key: 'ignored' })
    const recorder = new FakeModRecorder({ baseline })

    expect(await run(recorder, { slug: 'pack' }).exitCode).toBe(1)

    expect(await storedThemePreviews(versionId)).toEqual({})
  })

  it('refuses every theme of a version that records the same as another, naming the others', async () => {
    const versionId = await seedMod('pack')
    for (const key of ['dracula', 'dracula-copy', 'dracula-again', 'nord']) {
      await addTheme(db, versionId, { key, rendered: false })
    }
    const recorder = new FakeModRecorder({
      baseline,
      themes: {
        'custom:pack:dracula': DRACULA,
        'custom:pack:dracula-copy': DRACULA,
        'custom:pack:dracula-again': DRACULA,
        'custom:pack:nord': NORD,
      },
    })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(await storedThemePreviews(versionId)).toEqual({ nord: NORD_PREVIEW })
    expect(lines).toContain(
      'failed pack theme dracula in the terminal: looks the same as themes dracula-again, dracula-copy',
    )
    expect(lines).toContain(
      'failed pack theme dracula-again in the terminal: looks the same as themes dracula, dracula-copy',
    )
    expect(lines).toContain(
      'failed pack theme dracula-copy in the terminal: looks the same as themes dracula, dracula-again',
    )
    expect(lines).toContain('rendered pack theme nord in the terminal')
  })

  it('refuses a new theme that records the same as one stored by an earlier run', async () => {
    const versionId = await seedMod('pack')
    await addTheme(db, versionId, { key: 'dracula', rendered: false })
    const recorder = new FakeModRecorder({
      baseline,
      themes: { 'custom:pack:dracula': DRACULA, 'custom:pack:twin': DRACULA },
    })
    expect(await run(recorder).exitCode).toBe(0)
    await addTheme(db, versionId, { key: 'twin', rendered: false })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(await storedThemePreviews(versionId)).toEqual({})
    expect(lines).toContain(
      'failed pack theme dracula in the terminal: looks the same as theme twin',
    )
    expect(lines).toContain(
      'failed pack theme twin in the terminal: looks the same as theme dracula',
    )
  })
})

async function storedThemeShots(versionId: string) {
  return db
    .select({
      key: schema.modThemes.key,
      png: schema.modThemeDesktopPreviews.png,
      width: schema.modThemeDesktopPreviews.width,
      height: schema.modThemeDesktopPreviews.height,
      cardPng: schema.modThemeDesktopPreviews.cardPng,
      cardWidth: schema.modThemeDesktopPreviews.cardWidth,
      cardHeight: schema.modThemeDesktopPreviews.cardHeight,
      desktopVersion: schema.modThemeDesktopPreviews.desktopVersion,
      engineVersion: schema.modThemeDesktopPreviews.engineVersion,
    })
    .from(schema.modThemes)
    .innerJoin(
      schema.modThemeDesktopPreviews,
      eq(schema.modThemeDesktopPreviews.themeId, schema.modThemes.id),
    )
    .where(eq(schema.modThemes.modVersionId, versionId))
    .orderBy(schema.modThemes.key)
}

const STORED_THEME_SHOT = {
  png: FAKE_THEME_SHOT.png,
  width: FAKE_THEME_SHOT.width,
  height: FAKE_THEME_SHOT.height,
  cardPng: FAKE_THEME_SHOT.card.png,
  cardWidth: FAKE_THEME_SHOT.card.width,
  cardHeight: FAKE_THEME_SHOT.card.height,
  ...FAKE_DESKTOP,
}

const SETS_THEME = { events: ['session.start'], calls: ['$.theme.set'] }

function throwingThemes(throws: Record<string, Error>): FakeDesktopRecorder {
  const recorder = new FakeDesktopRecorder()
  const record = recorder.recordTheme.bind(recorder)
  recorder.recordTheme = async (request: DesktopThemeRequest) => {
    const error = throws[request.switchSteps[0] ?? '']
    if (error) throw error
    return record(request)
  }
  return recorder
}

describe('renderMods for the Desktop themes a mod sets', () => {
  const terminal = () => new FakeModRecorder({ baseline })

  async function seedThemeMod(slug = 'theme-examples') {
    const versionId = await seedMod(slug, { path: 'plugins/theme-examples' })
    await db
      .update(schema.modVersions)
      .set({ footprint: SETS_THEME })
      .where(eq(schema.modVersions.id, versionId))
    return versionId
  }

  it('records each Desktop theme in its own window after its switch steps, and stores its window and card', async () => {
    const versionId = await seedThemeMod()
    await addDesktopTheme(db, versionId, { key: 'night-reef', rendered: false })
    await addDesktopTheme(db, versionId, {
      key: 'honu-lagoon',
      window: 'light',
      rendered: false,
    })
    const desktopRecorder = new FakeDesktopRecorder()

    const { exitCode, lines } = run(terminal(), {}, desktopRecorder)

    expect(await exitCode).toBe(0)
    const mod = {
      source: { tarball: TARBALL, path: 'plugins/theme-examples' },
      pluginName: 'theme-examples',
    }
    expect(
      [...desktopRecorder.themeRequests].sort((a, b) => a.window.localeCompare(b.window)),
    ).toEqual([
      { mod, window: 'dark', switchSteps: ['/custom-theme night-reef'] },
      { mod, window: 'light', switchSteps: ['/custom-theme honu-lagoon'] },
    ])
    expect(await storedThemeShots(versionId)).toEqual([
      { key: 'honu-lagoon', ...STORED_THEME_SHOT },
      { key: 'night-reef', ...STORED_THEME_SHOT },
    ])
    expect(lines).toContain('rendered theme-examples theme honu-lagoon in Claude Desktop')
    expect(lines).toContain('rendered theme-examples theme night-reef in Claude Desktop')
  })

  it('refuses Desktop themes that came out as one look, and keeps the theme that differs', async () => {
    const versionId = await seedThemeMod()
    const unswitched = ['/custom-theme typo']
    await addDesktopTheme(db, versionId, { key: 'reef', switchSteps: unswitched, rendered: false })
    await addDesktopTheme(db, versionId, { key: 'koi', switchSteps: unswitched, rendered: false })
    await addDesktopTheme(db, versionId, { key: 'honu', rendered: false })

    const { exitCode, lines } = run(terminal(), {}, new FakeDesktopRecorder())

    expect(await exitCode).toBe(1)
    expect(lines).toContain(
      'failed theme-examples theme koi in Claude Desktop: looks the same as theme reef',
    )
    expect(lines).toContain(
      'failed theme-examples theme reef in Claude Desktop: looks the same as theme koi',
    )
    expect(lines).toContain('rendered theme-examples theme honu in Claude Desktop')
    expect((await storedThemeShots(versionId)).map((shot) => shot.key)).toEqual(['honu'])
  })

  it('records a theme its mod sets on its own with no steps', async () => {
    const versionId = await seedThemeMod('rainy-window')
    await addDesktopTheme(db, versionId, { key: 'rainy', switchSteps: [], rendered: false })
    const desktopRecorder = new FakeDesktopRecorder()

    expect(await run(terminal(), {}, desktopRecorder).exitCode).toBe(0)

    expect(desktopRecorder.themeRequests.map((r) => r.switchSteps)).toEqual([[]])
  })

  it("asks for a theme mod's own Desktop preview as the whole window, and other mods' as before", async () => {
    await seedThemeMod()
    await seedMod('token-weather')
    const desktopRecorder = new FakeDesktopRecorder()

    expect(await run(terminal(), {}, desktopRecorder).exitCode).toBe(0)

    const wholeWindow = Object.fromEntries(
      desktopRecorder.requests.map((r) => [r.mod.pluginName, r.wholeWindow]),
    )
    expect(wholeWindow).toEqual({ 'theme-examples': true, 'token-weather': undefined })
  })

  it('skips a Desktop theme that already has its shot on a full run, and records it again for its slug', async () => {
    const versionId = await seedThemeMod()
    await addDesktopTheme(db, versionId, { key: 'night-reef' })
    await addDesktopTheme(db, versionId, { key: 'koi-pond', rendered: false })

    const full = new FakeDesktopRecorder()
    expect(await run(terminal(), {}, full).exitCode).toBe(0)
    const one = new FakeDesktopRecorder()
    expect(await run(terminal(), { slug: 'theme-examples' }, one).exitCode).toBe(0)

    expect(full.themeRequests.map((r) => r.switchSteps)).toEqual([['/custom-theme koi-pond']])
    expect(one.themeRequests).toHaveLength(2)
  })

  it('removes the shot of a refused theme, says why and fails the run, and still records the others', async () => {
    const versionId = await seedThemeMod()
    await addDesktopTheme(db, versionId, { key: 'night-reef' })
    await addDesktopTheme(db, versionId, { key: 'koi-pond', rendered: false })
    const refused = new DesktopThemeRefused(
      "the theme didn't apply: the window looks the same as Desktop's own dark window",
    )

    const { exitCode, lines } = run(
      terminal(),
      { slug: 'theme-examples' },
      throwingThemes({ '/custom-theme night-reef': refused }),
    )

    expect(await exitCode).toBe(1)
    expect((await storedThemeShots(versionId)).map((s) => s.key)).toEqual(['koi-pond'])
    expect(lines).toContain(
      "failed theme-examples theme night-reef in Claude Desktop: the theme didn't apply: the window looks the same as Desktop's own dark window",
    )
    expect(lines).toContain('rendered theme-examples theme koi-pond in Claude Desktop')
  })

  it('keeps the earlier shot when the recording itself fails', async () => {
    const versionId = await seedThemeMod()
    await addDesktopTheme(db, versionId, { key: 'night-reef' })

    const { exitCode, lines } = run(
      terminal(),
      { slug: 'theme-examples' },
      throwingThemes({ '/custom-theme night-reef': new Error('sandbox died') }),
    )

    expect(await exitCode).toBe(1)
    expect((await storedThemeShots(versionId)).map((s) => s.key)).toEqual(['night-reef'])
    expect(lines).toContain(
      'failed theme-examples theme night-reef in Claude Desktop: sandbox died',
    )
  })
})
