import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { migratedPGlite } from '../helpers/test-db'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = await migratedPGlite()
  db = drizzle({ client, schema })
})
afterAll(async () => {
  await client.close()
})

let modCount = 0

/** A mod named after `label`, which may be any text: the name itself is a plugin id. */
async function insertMod(label: string) {
  const name = `mod-${++modCount}`
  const [mod] = await db
    .insert(schema.mods)
    .values({ slug: name, pluginName: name, title: label, authorGithub: 'octocat' })
    .returning()
  return mod?.id as string
}

function versionValues(
  modId: string,
  overrides: Partial<typeof schema.modVersions.$inferInsert> = {},
): typeof schema.modVersions.$inferInsert {
  return {
    modId,
    versionNumber: 1,
    repoUrl: 'https://github.com/octocat/mods',
    path: '',
    commitSha: 'a'.repeat(40),
    footprint: { events: [], calls: [] },
    validatedWith: '2.1.0',
    ...overrides,
  }
}

async function insertVersion(
  modId: string,
  overrides: Partial<typeof schema.modVersions.$inferInsert> = {},
) {
  const [version] = await db
    .insert(schema.modVersions)
    .values(versionValues(modId, overrides))
    .returning()
  return version?.id as string
}

function violates(constraint: string) {
  return { cause: { constraint } }
}

describe('mods schema', () => {
  it.each([
    ['12 characters', 'abcdef123456'],
    ['uppercase hex', 'A'.repeat(40)],
    ['a non-hex character', `${'a'.repeat(39)}g`],
  ])('rejects a commit_sha of %s', async (_name, commitSha) => {
    const modId = await insertMod(`sha-${commitSha}`)
    await expect(insertVersion(modId, { commitSha })).rejects.toMatchObject(
      violates('mod_versions_commit_sha_check'),
    )
  })

  it.each([
    ['plain http', 'http://github.com/octocat/mods'],
    ['credentials', 'https://user:token@github.com/octocat/mods'],
    ['a non-GitHub host', 'https://gitlab.com/octocat/mods'],
    ['a host that only starts with github.com', 'https://github.com.evil.example/octocat/mods'],
    ['a query', 'https://github.com/octocat/mods?ref=main'],
    ['a fragment', 'https://github.com/octocat/mods#main'],
    ['a trailing .git', 'https://github.com/octocat/mods.git'],
    ['a trailing .GIT', 'https://github.com/octocat/mods.GIT'],
    ['a path below the repo', 'https://github.com/octocat/mods/tree/main'],
  ])('rejects a repo_url with %s', async (_name, repoUrl) => {
    const modId = await insertMod(`repo-${repoUrl}`)
    await expect(insertVersion(modId, { repoUrl })).rejects.toMatchObject(
      violates('mod_versions_repo_url_check'),
    )
  })

  it.each([
    ['a parent segment', '../x'],
    ['an absolute path', '/etc'],
    ['a backslash', 'a\\b'],
    ['an inner parent segment', 'a/../b'],
  ])('rejects a path with %s', async (_name, path) => {
    const modId = await insertMod(`path-${path}`)
    await expect(insertVersion(modId, { path })).rejects.toMatchObject(
      violates('mod_versions_path_check'),
    )
  })

  it.each([
    ['a repo root', 'https://github.com/o/r', ''],
    ['a plugin folder', 'https://github.com/o/r', 'mods/context-bar'],
  ])('accepts %s', async (name, repoUrl, path) => {
    const modId = await insertMod(`accept-${name}`)
    await expect(
      insertVersion(modId, { repoUrl, path, commitSha: 'c'.repeat(40) }),
    ).resolves.toEqual(expect.any(String))
  })

  it('rejects a second version of one mod at the same repo, path and commit', async () => {
    const mod = await insertMod('dup-commit')
    await insertVersion(mod, { path: 'plugins/meter' })
    await expect(
      insertVersion(mod, { path: 'plugins/meter', versionNumber: 2 }),
    ).rejects.toMatchObject(violates('mod_versions_mod_source_uq'))
  })

  it("lets two mods pin the same commit, as two users' submissions of one folder do", async () => {
    const first = await insertMod('same-commit-a')
    const second = await insertMod('same-commit-b')
    await insertVersion(first, { path: 'plugins/meter' })

    await expect(insertVersion(second, { path: 'plugins/meter' })).resolves.toBeDefined()
  })

  it('lets two mods share a plugin_name, each under its own slug', async () => {
    await db
      .insert(schema.mods)
      .values({ slug: 'meter', pluginName: 'meter', title: 'A', authorGithub: 'octocat' })
    await db
      .insert(schema.mods)
      .values({ slug: 'meter-ada', pluginName: 'meter', title: 'B', authorGithub: 'ada' })

    const rows = await db
      .select({ slug: schema.mods.slug })
      .from(schema.mods)
      .where(eq(schema.mods.pluginName, 'meter'))
    expect(rows.map((r) => r.slug).sort()).toEqual(['meter', 'meter-ada'])
  })

  it.each([
    ['slug', { slug: 'x;sh', pluginName: 'meter' }, 'mods_slug_check'],
    ['plugin_name', { slug: 'meter-x', pluginName: 'my meter' }, 'mods_plugin_name_check'],
  ])('rejects a %s outside the plugin id rule', async (_name, names, constraint) => {
    await expect(
      db.insert(schema.mods).values({ ...names, title: 'T', authorGithub: 'octocat' }),
    ).rejects.toMatchObject(violates(constraint))
  })

  it('rejects a duplicate slug', async () => {
    await db
      .insert(schema.mods)
      .values({ slug: 'same-slug', pluginName: 'slug-a', title: 'A', authorGithub: 'octocat' })
    await expect(
      db
        .insert(schema.mods)
        .values({ slug: 'same-slug', pluginName: 'slug-b', title: 'B', authorGithub: 'octocat' }),
    ).rejects.toMatchObject(violates('mods_slug_unique'))
  })

  it('rejects a second preview for the same version and scenario', async () => {
    const versionId = await insertVersion(await insertMod('dup-preview'))
    const preview = {
      modVersionId: versionId,
      scenarioKey: 'default',
      segments: [],
      claudeCodeVersion: '2.1.0',
    }
    await db.insert(schema.modPreviews).values(preview)
    await expect(db.insert(schema.modPreviews).values(preview)).rejects.toMatchObject(
      violates('mod_previews_version_scenario_uq'),
    )
  })

  it('rejects a second copy event from the same IP hash', async () => {
    const modId = await insertMod('dup-copy')
    await db.insert(schema.modCopyEvents).values({ modId, ipHash: 'hash-1' })
    await expect(
      db.insert(schema.modCopyEvents).values({ modId, ipHash: 'hash-1' }),
    ).rejects.toMatchObject(violates('mod_copy_events_mod_ip_uq'))
  })

  it('removes versions, previews and copy events when the mod is deleted', async () => {
    const modId = await insertMod('cascade-mod')
    const versionId = await insertVersion(modId, { commitSha: 'b'.repeat(40) })
    await db.insert(schema.modPreviews).values({
      modVersionId: versionId,
      scenarioKey: 'default',
      segments: [{ text: 'hi' }],
      claudeCodeVersion: '2.1.0',
    })
    await db.insert(schema.modCopyEvents).values({ modId, ipHash: 'hash-cascade' })

    await db.delete(schema.mods).where(eq(schema.mods.id, modId))

    expect(
      await db.select().from(schema.modVersions).where(eq(schema.modVersions.modId, modId)),
    ).toEqual([])
    expect(
      await db
        .select()
        .from(schema.modPreviews)
        .where(eq(schema.modPreviews.modVersionId, versionId)),
    ).toEqual([])
    expect(
      await db.select().from(schema.modCopyEvents).where(eq(schema.modCopyEvents.modId, modId)),
    ).toEqual([])
  })
})

async function insertModAt(slug: string, status: schema.ModStatus) {
  const [mod] = await db
    .insert(schema.mods)
    .values({ slug, pluginName: slug, title: slug, authorGithub: 'octocat', status })
    .returning({ id: schema.mods.id })
  return mod?.id as string
}

async function modRow(id: string) {
  const [mod] = await db
    .select({
      slug: schema.mods.slug,
      status: schema.mods.status,
      currentVersionId: schema.mods.currentVersionId,
    })
    .from(schema.mods)
    .where(eq(schema.mods.id, id))
  return mod
}

describe("a mod's slug", () => {
  it.each(['published', 'removed'] as const)('refuses renaming a %s mod', async (status) => {
    const id = await insertModAt(`frozen-${status}`, status)
    await expect(
      db
        .update(schema.mods)
        .set({ slug: `renamed-${status}` })
        .where(eq(schema.mods.id, id)),
    ).rejects.toMatchObject(violates('mods_slug_immutable'))
  })

  it("lets an update write a published mod's slug back unchanged, as approving an update does", async () => {
    const id = await insertModAt('same-published', 'published')
    await db.update(schema.mods).set({ slug: 'same-published' }).where(eq(schema.mods.id, id))
    expect(await modRow(id)).toMatchObject({ slug: 'same-published', status: 'published' })
  })

  it('lets a draft be renamed', async () => {
    const id = await insertModAt('draft-before', 'draft')
    await db.update(schema.mods).set({ slug: 'draft-after' }).where(eq(schema.mods.id, id))
    expect(await modRow(id)).toMatchObject({ slug: 'draft-after', status: 'draft' })
  })

  it('lets approval rename a draft in the update that publishes it', async () => {
    const id = await insertModAt('gauge-3f9a2c', 'draft')
    await db
      .update(schema.mods)
      .set({ slug: 'gauge', status: 'published' })
      .where(eq(schema.mods.id, id))
    expect(await modRow(id)).toMatchObject({ slug: 'gauge', status: 'published' })
  })
})

describe("a mod's status", () => {
  it('refuses a status other than draft, published or removed', async () => {
    const id = await insertMod('unknown-status')
    await expect(
      db.execute(sql`UPDATE mods SET status = 'archived' WHERE id = ${id}`),
    ).rejects.toMatchObject(violates('mods_status_check'))
  })
})

describe("a mod's current version", () => {
  it("refuses a current_version_id that names another mod's version", async () => {
    const otherVersion = await insertVersion(await insertMod('pointer-owner'))
    const id = await insertMod('pointer-borrower')
    await expect(
      db.update(schema.mods).set({ currentVersionId: otherVersion }).where(eq(schema.mods.id, id)),
    ).rejects.toMatchObject(violates('mods_current_version_fk'))
  })

  it('lets a draft name its first version before the version is inserted, in one transaction', async () => {
    const id = randomUUID()
    const versionId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(schema.mods).values({
        id,
        slug: 'first-version',
        pluginName: 'first-version',
        title: 'T',
        authorGithub: 'octocat',
        currentVersionId: versionId,
      })
      await tx.insert(schema.modVersions).values(versionValues(id, { id: versionId }))
    })
    expect(await modRow(id)).toMatchObject({ currentVersionId: versionId })
  })

  it('lets a mod point at no version', async () => {
    const id = await insertMod('no-pointer')
    const versionId = await insertVersion(id)
    await db.update(schema.mods).set({ currentVersionId: versionId }).where(eq(schema.mods.id, id))
    await db.update(schema.mods).set({ currentVersionId: null }).where(eq(schema.mods.id, id))
    expect(await modRow(id)).toMatchObject({ currentVersionId: null })
  })

  it('deletes a mod that points at its own version, with its versions', async () => {
    const id = await insertMod('delete-pointed')
    const versionId = await insertVersion(id)
    await db.update(schema.mods).set({ currentVersionId: versionId }).where(eq(schema.mods.id, id))

    await db.delete(schema.mods).where(eq(schema.mods.id, id))

    expect(
      await db.select().from(schema.modVersions).where(eq(schema.modVersions.id, versionId)),
    ).toEqual([])
  })
})
