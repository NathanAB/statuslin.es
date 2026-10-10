import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { InputStep } from '@/mods/curation'
import type { GitHubSource } from '@/mods/github'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { RECORDING_MAX_ROW_BYTES } from '@/render/mods/bound-recording'
import { cropModPreview } from '@/render/mods/crop'
import { FakeDesktopRecorder } from '@/render/mods/desktop/fake-recorder'
import type { DesktopRecorder } from '@/render/mods/desktop/types'
import { FakeModRecorder } from '@/render/mods/fake-recorder'
import type { ModRecorder, Recording, RecordRequest } from '@/render/mods/recorder'
import { renderMods } from '../../../scripts/render-mods'
import {
  addMod,
  addVersion,
  openTestDb,
  REPO_URL,
  SEEDED_PREVIEW,
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
  footprint?: schema.ModFootprint
}

async function seedMod(
  slug: string,
  {
    status = 'draft',
    commitSha = nextSha(),
    rendered = false,
    path = '',
    inputSteps = [],
    footprint,
  }: Seed = {},
) {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, {
    commitSha,
    versionNumber: 1,
    rendered,
    path,
    ...(footprint ? { footprint } : {}),
  })
  await db
    .update(schema.modVersions)
    .set({ inputSteps })
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
      cardAnchor: schema.modDesktopPreviews.cardAnchor,
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
  const github: Pick<GitHubSource, 'tarball'> = {
    async tarball(repoUrl, commitSha) {
      tarballs.push(`${repoUrl}@${commitSha}`)
      return TARBALL
    },
  }
  const exitCode = renderMods(options, {
    db,
    recorder,
    desktopRecorder,
    github,
    log: (line) => lines.push(line),
  })
  return { exitCode, lines, tarballs }
}

const modRequests = (requests: RecordRequest[]) => requests.filter((r) => r.mod !== null)
const baselineRequests = (requests: RecordRequest[]) => requests.filter((r) => r.mod === null)

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

  it('records each version with its tarball, path, plugin name and input steps', async () => {
    const inputSteps: InputStep[] = [{ type: 'text', text: '/radar', submit: false }]
    await seedMod('radar', { commitSha: sha('d'), path: 'mods/radar', inputSteps })
    const recorder = new FakeModRecorder({ baseline })

    const { exitCode, tarballs } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(tarballs).toEqual([`${REPO_URL}@${sha('d')}`])
    expect(modRequests(recorder.requests)).toEqual([
      {
        mod: { source: { tarball: TARBALL, path: 'mods/radar' }, pluginName: 'radar' },
        inputSteps,
      },
    ])
  })

  it('records the baseline once for a run of several mods', async () => {
    await seedMod('skins')
    await seedMod('token-weather')
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder).exitCode).toBe(0)

    expect(baselineRequests(recorder.requests)).toEqual([{ mod: null, inputSteps: [] }])
    expect(modRequests(recorder.requests)).toHaveLength(2)
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

  it("renders only a mod's own current version, never one that belongs to another mod", async () => {
    const othersVersionId = await seedMod('token-weather')
    const modId = await addMod(db, 'skins', 'draft')
    await setCurrentVersion(db, modId, othersVersionId)
    const recorder = new FakeModRecorder({
      baseline,
      mods: { skins, 'token-weather': tokenWeather },
    })

    expect(await run(recorder).exitCode).toBe(0)

    expect(modRequests(recorder.requests).map((r) => r.mod?.pluginName)).toEqual(['token-weather'])
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
const SHOT = { png: PNG, width: 790, height: 52, cardAnchor: 'bottom' as const }
const FAKE_DESKTOP = { desktopVersion: '0.0.0-fake', engineVersion: '0.0.0-fake' }
const STORED_NOTHING = {
  scenarioKey: MOD_SCENARIO_KEY,
  kind: 'nothing',
  png: null,
  width: null,
  height: null,
  cardAnchor: null,
  ...FAKE_DESKTOP,
}

async function seedDesktopShot(versionId: string) {
  await db.insert(schema.modDesktopPreviews).values({
    modVersionId: versionId,
    scenarioKey: MOD_SCENARIO_KEY,
    kind: 'shot',
    ...SHOT,
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
  }
}

describe('renderMods in Claude Desktop', () => {
  const terminal = () =>
    new FakeModRecorder({ baseline, mods: { skins, 'token-weather': tokenWeather } })

  it('stores a shot with its PNG, CSS size, card anchor and versions', async () => {
    const versionId = await seedMod('token-weather')

    const { exitCode, lines } = run(
      terminal(),
      {},
      new FakeDesktopRecorder({ 'token-weather': SHOT }),
    )

    expect(await exitCode).toBe(0)
    expect(await storedDesktopPreviews(versionId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, kind: 'shot', ...SHOT, ...FAKE_DESKTOP },
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

  it('asks for the mod with its input steps and where its footprint draws', async () => {
    const inputSteps: InputStep[] = [{ type: 'text', text: '/radar' }]
    await seedMod('radar', {
      path: 'mods/radar',
      inputSteps,
      footprint: {
        events: ['ui.render{component=Pane, requestId=radar}', 'ui.render{component=AbovePrompt}'],
        calls: ['$.ui.toast'],
      },
    })
    const desktopRecorder = new FakeDesktopRecorder()

    expect(await run(new FakeModRecorder({ baseline }), {}, desktopRecorder).exitCode).toBe(0)

    expect(desktopRecorder.requests).toEqual([
      {
        mod: { source: { tarball: TARBALL, path: 'mods/radar' }, pluginName: 'radar' },
        inputSteps,
        draws: ['above-prompt', 'pane', 'toast'],
      },
    ])
  })

  it('keeps the earlier Desktop result and still stores the terminal when Desktop fails', async () => {
    const versionId = await seedMod('skins')
    await seedDesktopShot(versionId)

    const { exitCode, lines } = run(terminal(), {}, failingDesktop('skins'))

    expect(await exitCode).toBe(1)
    expect(await storedDesktopPreviews(versionId)).toMatchObject([{ kind: 'shot', ...SHOT }])
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
