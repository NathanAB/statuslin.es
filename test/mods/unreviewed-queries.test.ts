import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { findUnreviewedMod, listUnreviewedMods } from '@/mods/unreviewed-queries'
import {
  addMod,
  addShownDraft,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({ id: 'ada', name: 'Ada', email: 'ada@test.com' })
})
beforeEach(async () => {
  await db.delete(schema.unreviewedMods)
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

const ROW = {
  owner: 'OctoCat',
  pluginName: 'meter',
  description: 'A token meter.',
  repoUrl: 'https://github.com/OctoCat/meter',
  path: 'plugins/meter',
  commitSha: sha('c'),
  committedAt: new Date('2026-11-01T09:30:00Z'),
  pluginVersion: '0.3.0',
  license: 'MIT',
  stars: 12,
  footprint: { events: ['command.run{command=meter}'], calls: [] },
  validatedWith: '2.1.296',
  checkedAt: new Date('2026-11-12T08:00:00Z'),
}

async function addRow(overrides: Partial<typeof ROW> = {}) {
  await db.insert(schema.unreviewedMods).values({ ...ROW, ...overrides })
}

/** A mod whose current version pins `repoUrl` at `path`. */
async function addListing(
  slug: string,
  status: schema.ModStatus,
  { repoUrl = ROW.repoUrl, path = ROW.path, pluginName = slug } = {},
) {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, {
    commitSha: sha('e'),
    versionNumber: 1,
    repoUrl,
    path,
  })
  await setCurrentVersion(db, modId, versionId)
  if (pluginName !== slug) {
    await db.update(schema.mods).set({ pluginName }).where(eq(schema.mods.slug, slug))
  }
}

describe('findUnreviewedMod', () => {
  it("finds the page whatever the owner's case, with the owner as GitHub spells it", async () => {
    await addRow()

    expect(await findUnreviewedMod(db, { owner: 'octocat', pluginName: 'meter' })).toEqual({
      kind: 'page',
      mod: {
        owner: 'OctoCat',
        pluginName: 'meter',
        description: 'A token meter.',
        repoUrl: 'https://github.com/OctoCat/meter',
        path: 'plugins/meter',
        commitSha: sha('c'),
        committedAt: '2026-11-01T09:30:00.000Z',
        license: 'MIT',
        stars: 12,
        footprint: { events: ['command.run{command=meter}'], calls: [] },
        validatedWith: '2.1.296',
        checkedAt: '2026-11-12T08:00:00.000Z',
      },
    })
  })

  it('answers null for an owner and name it has no page for', async () => {
    await addRow()

    expect(await findUnreviewedMod(db, { owner: 'octocat', pluginName: 'other' })).toBeNull()
    expect(await findUnreviewedMod(db, { owner: 'someone', pluginName: 'meter' })).toBeNull()
  })

  it('points at the listing once a published mod pins the same folder', async () => {
    await addRow()
    await addListing('token-meter', 'published')

    expect(await findUnreviewedMod(db, { owner: 'OctoCat', pluginName: 'meter' })).toEqual({
      kind: 'reviewed',
      slug: 'token-meter',
    })
  })

  it('points at the listing after the row is gone, by owner and plugin name', async () => {
    await addListing('meter-octocat', 'published', { pluginName: 'meter' })

    expect(await findUnreviewedMod(db, { owner: 'octocat', pluginName: 'meter' })).toEqual({
      kind: 'reviewed',
      slug: 'meter-octocat',
    })
  })

  it('keeps the page while the mod holding the folder is not published', async () => {
    await addRow()
    await addListing('token-meter', 'draft')
    await addListing('old-meter', 'removed', { path: '' })

    expect((await findUnreviewedMod(db, { owner: 'OctoCat', pluginName: 'meter' }))?.kind).toBe(
      'page',
    )
  })

  it('hides the page once a delisted mod has pinned the same folder in any version', async () => {
    await addRow()
    await addListing('token-meter', 'removed', { path: 'plugins/renamed' })
    const [removed] = await db
      .select({ id: schema.mods.id })
      .from(schema.mods)
      .where(eq(schema.mods.slug, 'token-meter'))
    await addVersion(db, removed?.id as string, {
      commitSha: sha('d'),
      versionNumber: 2,
      repoUrl: ROW.repoUrl,
      path: ROW.path,
    })

    expect(await findUnreviewedMod(db, { owner: 'OctoCat', pluginName: 'meter' })).toBeNull()
  })

  it('still points at a published listing for the folder when another was delisted', async () => {
    await addRow()
    await addListing('old-meter', 'removed')
    await addListing('token-meter', 'published')

    expect(await findUnreviewedMod(db, { owner: 'OctoCat', pluginName: 'meter' })).toEqual({
      kind: 'reviewed',
      slug: 'token-meter',
    })
  })

  it('keeps the page when a published mod pins another folder of the repository', async () => {
    await addRow()
    await addListing('other', 'published', { path: 'plugins/other' })

    expect((await findUnreviewedMod(db, { owner: 'OctoCat', pluginName: 'meter' }))?.kind).toBe(
      'page',
    )
  })
})

describe('listUnreviewedMods', () => {
  it('lists the pages by name, leaving out any a published mod now holds', async () => {
    await addRow({ pluginName: 'zebra', path: 'plugins/zebra' })
    await addRow()
    await addRow({
      owner: 'ada',
      pluginName: 'abacus',
      repoUrl: 'https://github.com/ada/abacus',
      path: '',
    })
    await addListing('abacus', 'published', { repoUrl: 'https://github.com/ada/abacus', path: '' })

    expect(await listUnreviewedMods(db)).toEqual([
      {
        owner: 'OctoCat',
        pluginName: 'meter',
        description: 'A token meter.',
        checkedAt: ROW.checkedAt,
      },
      {
        owner: 'OctoCat',
        pluginName: 'zebra',
        description: 'A token meter.',
        checkedAt: ROW.checkedAt,
      },
    ])
  })

  it('leaves out a page whose folder a delisted mod pinned', async () => {
    await addRow()
    await addRow({ pluginName: 'zebra', path: 'plugins/zebra' })
    await addListing('old-meter', 'removed')

    expect((await listUnreviewedMods(db)).map((link) => link.pluginName)).toEqual(['zebra'])
  })
})

// A curated Desktop theme pack the operator showed as an unreviewed mod (ADR 0014).
const LOOKS = {
  slug: 'looks-marketplace-name',
  pluginName: 'looks',
  repoUrl: 'https://github.com/Ada/looks',
  path: 'plugins/looks',
  description: 'Forty looks for Claude Desktop.',
}

async function addLooks(overrides: Partial<Parameters<typeof addShownDraft>[1]> = {}) {
  const seeded = await addShownDraft(db, { ...LOOKS, ...overrides })
  await db
    .update(schema.modVersions)
    .set({
      license: 'Apache-2.0',
      footprint: { events: ['session.start'], calls: ['$.theme.set'] },
      validatedWith: '2.1.330',
      createdAt: new Date('2026-11-20T10:00:00Z'),
    })
    .where(eq(schema.modVersions.id, seeded.versionId))
  return seeded
}

async function rejectSubmissionOf(versionId: string) {
  await db.insert(schema.submissions).values({
    id: versionId,
    kind: 'mod',
    modVersionId: versionId,
    submittedBy: 'ada',
    status: 'rejected',
  })
}

describe('findUnreviewedMod for a shown curated draft', () => {
  it('finds its page by its repository owner and plugin name, never its slug', async () => {
    await addLooks()

    expect(await findUnreviewedMod(db, { owner: 'ada', pluginName: 'looks' })).toEqual({
      kind: 'page',
      mod: {
        owner: 'Ada',
        pluginName: 'looks',
        description: 'Forty looks for Claude Desktop.',
        repoUrl: 'https://github.com/Ada/looks',
        path: 'plugins/looks',
        commitSha: sha('f'),
        committedAt: null,
        license: 'Apache-2.0',
        stars: null,
        footprint: { events: ['session.start'], calls: ['$.theme.set'] },
        validatedWith: '2.1.330',
        checkedAt: '2026-11-20T10:00:00.000Z',
      },
    })
    expect(
      await findUnreviewedMod(db, { owner: 'ada', pluginName: 'looks-marketplace-name' }),
    ).toBeNull()
  })

  it('has no page for a draft the operator has not shown', async () => {
    await addLooks({ shown: false })

    expect(await findUnreviewedMod(db, { owner: 'Ada', pluginName: 'looks' })).toBeNull()
  })

  it('has no page once its folder had a submission rejected', async () => {
    await addLooks()
    const other = await addMod(db, 'submitted-looks', 'draft')
    const versionId = await addVersion(db, other, {
      commitSha: sha('9'),
      versionNumber: 1,
      repoUrl: LOOKS.repoUrl,
      path: LOOKS.path,
    })
    await rejectSubmissionOf(versionId)

    expect(await findUnreviewedMod(db, { owner: 'Ada', pluginName: 'looks' })).toBeNull()
  })

  it('has no page once a delisted mod pinned its folder', async () => {
    await addLooks()
    await addListing('old-looks', 'removed', { repoUrl: LOOKS.repoUrl, path: LOOKS.path })

    expect(await findUnreviewedMod(db, { owner: 'Ada', pluginName: 'looks' })).toBeNull()
  })

  it('points at the listing once the draft itself is published', async () => {
    const { modId } = await addLooks()
    await db
      .update(schema.mods)
      .set({ status: 'published', unreviewedPageAt: null })
      .where(eq(schema.mods.id, modId))

    expect(await findUnreviewedMod(db, { owner: 'Ada', pluginName: 'looks' })).toEqual({
      kind: 'reviewed',
      slug: 'looks-marketplace-name',
    })
  })
})

describe('listUnreviewedMods with shown curated drafts', () => {
  it('lists a shown draft among the rows by name, dated by its version, and no unshown draft', async () => {
    await addRow({ pluginName: 'zebra', path: 'plugins/zebra' })
    await addRow()
    await addLooks()
    await addLooks({
      slug: 'hidden-pack',
      pluginName: 'hidden',
      repoUrl: 'https://github.com/Ada/hidden',
      shown: false,
    })

    expect(await listUnreviewedMods(db)).toEqual([
      {
        owner: 'Ada',
        pluginName: 'looks',
        description: 'Forty looks for Claude Desktop.',
        checkedAt: new Date('2026-11-20T10:00:00Z'),
      },
      {
        owner: 'OctoCat',
        pluginName: 'meter',
        description: 'A token meter.',
        checkedAt: ROW.checkedAt,
      },
      {
        owner: 'OctoCat',
        pluginName: 'zebra',
        description: 'A token meter.',
        checkedAt: ROW.checkedAt,
      },
    ])
  })

  it('leaves out a shown draft whose folder had a submission rejected', async () => {
    const { versionId } = await addLooks()
    await rejectSubmissionOf(versionId)

    expect(await listUnreviewedMods(db)).toEqual([])
  })
})
