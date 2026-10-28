import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import { FakeDesktopRecorder } from '@/render/mods/desktop/fake-recorder'
import type { DesktopRecordRequest } from '@/render/mods/desktop/types'
import { renderStatusLineDesktop } from '../../scripts/render-status-line-desktop'
import { addPublishedConfig, currentVersionOf } from '../gallery/seed-configs'
import {
  addMod,
  addVersion,
  openTestDb,
  REPO_URL,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

const TARBALL = new Uint8Array([31, 139, 8, 0])
const MOD_SHA = sha('a')
const VERSIONS = { desktopVersion: '1.2.3', engineVersion: '2.1.300' }
const CARD = { png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7]), width: 790, height: 40 }
const SHOT = {
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]),
  width: 1100,
  height: 900,
  card: CARD,
}
const FOOTPRINT = { events: ['ui.render{component=AbovePrompt}'], calls: [] }

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
beforeEach(async () => {
  await db.delete(schema.configs)
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

async function seedStatuslineAnywhere(commitSha = MOD_SHA) {
  const modId = await addMod(db, STATUSLINE_ANYWHERE_MOD_SLUG, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha,
    versionNumber: 1,
    path: 'plugin',
    footprint: FOOTPRINT,
  })
  await setCurrentVersion(db, modId, versionId)
}

async function seedConfig(slug: string, opts: Parameters<typeof addPublishedConfig>[2] = {}) {
  return currentVersionOf(
    db,
    await addPublishedConfig(db, slug, { source: `echo ${slug}`, ...opts }),
  )
}

async function stored(versionId: string) {
  return db
    .select({
      kind: schema.configDesktopPreviews.kind,
      png: schema.configDesktopPreviews.png,
      width: schema.configDesktopPreviews.width,
      height: schema.configDesktopPreviews.height,
      desktopVersion: schema.configDesktopPreviews.desktopVersion,
      engineVersion: schema.configDesktopPreviews.engineVersion,
      modCommitSha: schema.configDesktopPreviews.modCommitSha,
      createdAt: schema.configDesktopPreviews.createdAt,
    })
    .from(schema.configDesktopPreviews)
    .where(eq(schema.configDesktopPreviews.configVersionId, versionId))
}

async function seedStored(
  versionId: string,
  row: Partial<typeof schema.configDesktopPreviews.$inferInsert> = {},
) {
  await db.insert(schema.configDesktopPreviews).values({
    configVersionId: versionId,
    kind: 'shot',
    png: CARD.png,
    width: CARD.width,
    height: CARD.height,
    ...VERSIONS,
    modCommitSha: MOD_SHA,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...row,
  })
}

function run(recorder: FakeDesktopRecorder, options: { slug?: string; all?: boolean } = {}) {
  const lines: string[] = []
  const tarballs: string[] = []
  const exitCode = renderStatusLineDesktop(options, {
    db,
    desktopRecorder: recorder,
    fetchPlugin: async ({ repoUrl, commitSha }) => {
      tarballs.push(`${repoUrl}@${commitSha}`)
      return TARBALL
    },
    log: (line) => lines.push(line),
  })
  return { exitCode, lines, tarballs }
}

/** A fake that fails for the named status line sources. */
class FailingRecorder extends FakeDesktopRecorder {
  constructor(private readonly failFor: string[]) {
    super({}, VERSIONS)
  }

  override async record(request: DesktopRecordRequest) {
    if (this.failFor.includes(request.statusLine?.source ?? '')) throw new Error('E2B hiccup')
    return super.record(request)
  }
}

describe('renderStatusLineDesktop', () => {
  it('stores the card band, its CSS size, the versions and the statusline-anywhere commit', async () => {
    await seedStatuslineAnywhere()
    const versionId = await seedConfig('dracula', { source: 'print("hi")', interpreter: 'python' })
    const recorder = new FakeDesktopRecorder({ 'print("hi")': SHOT }, VERSIONS)

    const { exitCode, lines, tarballs } = run(recorder)

    expect(await exitCode).toBe(0)
    const [row] = await stored(versionId)
    expect(row).toMatchObject({
      kind: 'shot',
      width: CARD.width,
      height: CARD.height,
      ...VERSIONS,
      modCommitSha: MOD_SHA,
    })
    expect(Array.from(row?.png ?? [])).toEqual(Array.from(CARD.png))
    expect(lines).toEqual(['rendered dracula in Claude Desktop'])
    expect(tarballs).toEqual([`${REPO_URL}@${MOD_SHA}`])
  })

  it('records the status line through statusline-anywhere', async () => {
    await seedStatuslineAnywhere()
    await seedConfig('dracula', { source: 'print("hi")', interpreter: 'python' })
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    await run(recorder).exitCode

    expect(recorder.requests).toEqual([
      {
        mod: {
          source: { tarball: TARBALL, path: 'plugin' },
          pluginName: STATUSLINE_ANYWHERE_MOD_SLUG,
        },
        inputSteps: [],
        statusLine: {
          source: 'print("hi")',
          interpreter: 'python',
          networkHosts: [],
          readsClaudeToken: false,
        },
      },
    ])
  })

  it('stores that it drew nothing over an older shot, and moves the image URL on', async () => {
    await seedStatuslineAnywhere()
    const versionId = await seedConfig('blank')
    await seedStored(versionId, { desktopVersion: '1.0.0' })

    const { exitCode, lines } = run(new FakeDesktopRecorder({}, VERSIONS))

    expect(await exitCode).toBe(0)
    const [row] = await stored(versionId)
    expect(row).toMatchObject({
      kind: 'nothing',
      png: null,
      width: null,
      height: null,
      ...VERSIONS,
    })
    expect(row?.createdAt.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime())
    expect(lines).toEqual(['drew nothing blank in Claude Desktop'])
  })

  it('records a status line with network hosts, passing its hosts and token read', async () => {
    await seedStatuslineAnywhere()
    await seedConfig('weather', { networkHosts: ['wttr.in'] })
    await seedConfig('usage', { networkHosts: ['api.anthropic.com'], readsClaudeToken: true })
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(recorder.requests.map((r) => r.statusLine)).toEqual([
      expect.objectContaining({ networkHosts: ['api.anthropic.com'], readsClaudeToken: true }),
      expect.objectContaining({ networkHosts: ['wttr.in'], readsClaudeToken: false }),
    ])
    expect(lines).toEqual([
      'drew nothing usage in Claude Desktop',
      'drew nothing weather in Claude Desktop',
    ])
  })

  it('skips a status line that needs a real Anthropic host, and says so', async () => {
    await seedStatuslineAnywhere()
    const versionId = await seedConfig('console', { networkHosts: ['api.anthropic.com'] })
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(recorder.requests).toEqual([])
    expect(await stored(versionId)).toEqual([])
    expect(lines).toEqual(['skipped console: needs an Anthropic host; no Desktop shot'])
  })

  it('leaves out status lines that are not published', async () => {
    await seedStatuslineAnywhere()
    await seedConfig('draft', { status: 'draft' })
    await seedConfig('removed', { status: 'removed' })
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(recorder.requests).toEqual([])
    expect(lines).toEqual([])
  })

  it.each([
    ['Desktop', { desktopVersion: '1.0.0' }],
    ['engine', { engineVersion: '2.1.0' }],
    ['statusline-anywhere commit', { modCommitSha: sha('b') }],
  ])('re-records a result made with another %s, and leaves current ones', async (_name, stale) => {
    await seedStatuslineAnywhere()
    const staleVersion = await seedConfig('stale')
    await seedStored(staleVersion, stale)
    await seedStored(await seedConfig('fresh'))
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines } = run(recorder)

    expect(await exitCode).toBe(0)
    expect(recorder.requests.map((r) => r.statusLine?.source)).toEqual(['echo stale'])
    expect(lines).toEqual([
      'up to date fresh in Claude Desktop',
      'drew nothing stale in Claude Desktop',
    ])
  })

  it('re-records every status line with --all', async () => {
    await seedStatuslineAnywhere()
    await seedStored(await seedConfig('fresh'))
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines } = run(recorder, { all: true })

    expect(await exitCode).toBe(0)
    expect(lines).toEqual(['drew nothing fresh in Claude Desktop'])
  })

  it('records only the one status line --slug names', async () => {
    await seedStatuslineAnywhere()
    await seedConfig('one')
    await seedConfig('two')
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines } = run(recorder, { slug: 'two' })

    expect(await exitCode).toBe(0)
    expect(recorder.requests.map((r) => r.statusLine?.source)).toEqual(['echo two'])
    expect(lines).toEqual(['drew nothing two in Claude Desktop'])
  })

  it('fails for a --slug that names no published status line', async () => {
    await seedStatuslineAnywhere()

    const { exitCode, lines } = run(new FakeDesktopRecorder({}, VERSIONS), { slug: 'nope' })

    expect(await exitCode).toBe(1)
    expect(lines).toEqual(['no published status line with slug "nope"'])
  })

  it('keeps the old result when a recording fails, records the rest, and exits 1', async () => {
    await seedStatuslineAnywhere()
    const broken = await seedConfig('broken')
    await seedStored(broken, { desktopVersion: '1.0.0' })
    const fine = await seedConfig('fine')

    const { exitCode, lines } = run(new FailingRecorder(['echo broken']))

    expect(await exitCode).toBe(1)
    expect(await stored(broken)).toEqual([
      expect.objectContaining({ kind: 'shot', desktopVersion: '1.0.0' }),
    ])
    expect(await stored(fine)).toEqual([expect.objectContaining({ kind: 'nothing' })])
    // Recordings run side by side, so their lines come in the order they finish.
    expect([...lines].sort()).toEqual([
      'drew nothing fine in Claude Desktop',
      'failed broken in Claude Desktop: E2B hiccup',
    ])
  })

  it('fails before recording anything when statusline-anywhere has no current version', async () => {
    await seedConfig('dracula')
    const recorder = new FakeDesktopRecorder({}, VERSIONS)

    const { exitCode, lines, tarballs } = run(recorder)

    expect(await exitCode).toBe(1)
    expect(recorder.requests).toEqual([])
    expect(tarballs).toEqual([])
    expect(lines).toEqual([
      `the ${STATUSLINE_ANYWHERE_MOD_SLUG} mod has no current version; import it first (import:mods)`,
    ])
  })
})
