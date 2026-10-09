import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})
afterAll(async () => {
  await client.close()
})

async function insertMod(name: string) {
  const [mod] = await db
    .insert(schema.mods)
    .values({ slug: name, pluginName: name, title: name, authorGithub: 'octocat' })
    .returning()
  return mod?.id as string
}

async function insertVersion(
  modId: string,
  overrides: Partial<typeof schema.modVersions.$inferInsert> = {},
) {
  const [version] = await db
    .insert(schema.modVersions)
    .values({
      modId,
      versionNumber: 1,
      repoUrl: 'https://github.com/octocat/mods',
      path: '',
      commitSha: 'a'.repeat(40),
      footprint: { events: [], calls: [] },
      validatedWith: '2.1.0',
      ...overrides,
    })
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

  it('rejects a repo_url that is not https', async () => {
    const modId = await insertMod('http-repo')
    await expect(
      insertVersion(modId, { repoUrl: 'http://github.com/octocat/mods' }),
    ).rejects.toMatchObject(violates('mod_versions_repo_url_check'))
  })

  it('rejects a second version at the same repo, path and commit', async () => {
    const first = await insertMod('dup-commit-a')
    const second = await insertMod('dup-commit-b')
    await insertVersion(first, { path: 'plugins/meter' })
    await expect(insertVersion(second, { path: 'plugins/meter' })).rejects.toMatchObject(
      violates('mod_versions_repo_path_commit_uq'),
    )
  })

  it('rejects a duplicate plugin_name', async () => {
    await db
      .insert(schema.mods)
      .values({ slug: 'plugin-a', pluginName: 'meter', title: 'A', authorGithub: 'octocat' })
    await expect(
      db
        .insert(schema.mods)
        .values({ slug: 'plugin-b', pluginName: 'meter', title: 'B', authorGithub: 'octocat' }),
    ).rejects.toMatchObject(violates('mods_plugin_name_unique'))
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
