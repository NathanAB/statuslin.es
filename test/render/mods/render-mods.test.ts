import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { InputStep } from '@/mods/curation'
import type { GitHubSource } from '@/mods/github'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { RECORDING_MAX_ROW_BYTES } from '@/render/mods/bound-recording'
import { cropModPreview } from '@/render/mods/crop'
import { FakeModRecorder } from '@/render/mods/fake-recorder'
import type { ModRecorder, Recording, RecordRequest } from '@/render/mods/recorder'
import { renderMods } from '../../../scripts/render-mods'
import {
  addMod,
  addVersion,
  openTestDb,
  REPO_URL,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../../mods/seed-mods'
import baseline from './fixtures/baseline.json'
import skins from './fixtures/skins.json'
import tokenWeather from './fixtures/token-weather.json'

const TARBALL = new Uint8Array([31, 139, 8, 0])
const EARLIER_PREVIEW = { segments: [{ text: 'meter' }], claudeCodeVersion: '2.1.0' }

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
  commitSha?: string
  rendered?: boolean
  path?: string
  inputSteps?: InputStep[]
}

async function seedMod(
  slug: string,
  { commitSha = nextSha(), rendered = false, path = '', inputSteps = [] }: Seed = {},
) {
  const modId = await addMod(db, slug, 'draft')
  const versionId = await addVersion(db, modId, {
    commitSha,
    versionNumber: 1,
    rendered,
    path,
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

function run(recorder: ModRecorder, options: { slug?: string } = {}) {
  const lines: string[] = []
  const tarballs: string[] = []
  const github: Pick<GitHubSource, 'tarball'> = {
    async tarball(repoUrl, commitSha) {
      tarballs.push(`${repoUrl}@${commitSha}`)
      return TARBALL
    },
  }
  const exitCode = renderMods(options, { db, recorder, github, log: (line) => lines.push(line) })
  return { exitCode, lines, tarballs }
}

const modRequests = (requests: RecordRequest[]) => requests.filter((r) => r.mod !== null)
const baselineRequests = (requests: RecordRequest[]) => requests.filter((r) => r.mod === null)

/** Wraps a recorder to fail for named plugins, or report a Claude Code version per plugin. */
function scriptedRecorder(
  inner: ModRecorder,
  { failFor = [], versions = {}, baselineVersions = [] as string[] } = {} as {
    failFor?: string[]
    versions?: Record<string, string>
    baselineVersions?: string[]
  },
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
    expect(lines).toContain('rendered token-weather')
  })

  it('stores nothing for a crop with no rows of its own and keeps the earlier preview', async () => {
    const versionId = await seedMod('statusline-anywhere', { rendered: true })
    const recorder = new FakeModRecorder({ baseline })

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(await storedPreviews(versionId)).toEqual([
      { scenarioKey: MOD_SCENARIO_KEY, ...EARLIER_PREVIEW },
    ])
    expect(lines).toContain(
      'not rendered statusline-anywhere: the recording matches the baseline outside the prompt row',
    )
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
      { scenarioKey: MOD_SCENARIO_KEY, ...EARLIER_PREVIEW },
    ])
    expect(await storedPreviews(fineId)).toHaveLength(1)
    expect(lines).toContain('failed skins: sandbox for skins died')
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
      { scenarioKey: MOD_SCENARIO_KEY, ...EARLIER_PREVIEW },
    ])
    expect(lines).toContain(
      `failed flood: recording row 1 is over the ${RECORDING_MAX_ROW_BYTES}-byte limit`,
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

  it('exits non-zero when --slug names no mod', async () => {
    await seedMod('skins')
    const recorder = new FakeModRecorder({ baseline })

    const { exitCode, lines } = run(recorder, { slug: 'nope' })

    expect(await exitCode).toBe(1)
    expect(recorder.requests).toEqual([])
    expect(lines).toContain('no mod with slug "nope" has a current version')
  })
})
