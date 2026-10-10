import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/db/schema'
import type { GitHub } from '@/mods/github'
import { MOD_SCENARIO_KEY } from '@/mods/queries'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

export const REPO_URL = 'https://github.com/octocat/meter'

export async function openTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return { db, close: () => client.close() }
}

export function sha(char: string): string {
  return char.repeat(40)
}

export async function addMod(db: TestDb, slug: string, status: schema.ModStatus): Promise<string> {
  const [mod] = await db
    .insert(schema.mods)
    .values({ slug, pluginName: slug, title: slug, authorGithub: 'octocat', status })
    .returning()
  return mod?.id as string
}

/** The preview `addVersion` stores for a version seeded as rendered. */
export const SEEDED_PREVIEW = { segments: [{ text: 'meter' }], claudeCodeVersion: '2.1.0' }

interface VersionSeed {
  commitSha: string
  versionNumber: number
  rendered?: boolean
  pluginVersion?: string | null
  footprint?: schema.ModFootprint
  repoUrl?: string
  path?: string
}

export async function addVersion(db: TestDb, modId: string, seed: VersionSeed): Promise<string> {
  const [version] = await db
    .insert(schema.modVersions)
    .values({
      modId,
      versionNumber: seed.versionNumber,
      repoUrl: seed.repoUrl ?? REPO_URL,
      path: seed.path ?? '',
      commitSha: seed.commitSha,
      pluginVersion: seed.pluginVersion ?? null,
      footprint: seed.footprint ?? { events: [], calls: [] },
      validatedWith: '2.1.0',
    })
    .returning()
  const versionId = version?.id as string
  if (seed.rendered ?? true) {
    await db.insert(schema.modPreviews).values({
      modVersionId: versionId,
      scenarioKey: MOD_SCENARIO_KEY,
      ...SEEDED_PREVIEW,
    })
  }
  return versionId
}

export async function setCurrentVersion(db: TestDb, modId: string, versionId: string) {
  await db.update(schema.mods).set({ currentVersionId: versionId }).where(eq(schema.mods.id, modId))
}

/** A mod whose current version is its only version, rendered with a clean-main preview unless told not to. */
export async function seedMod(
  db: TestDb,
  slug: string,
  status: schema.ModStatus,
  commitChar: string,
  rendered = true,
): Promise<{ modId: string; versionId: string }> {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, {
    commitSha: sha(commitChar),
    versionNumber: 1,
    rendered,
  })
  await setCurrentVersion(db, modId, versionId)
  return { modId, versionId }
}

export async function modState(db: TestDb, slug: string) {
  const [row] = await db
    .select({ status: schema.mods.status, currentVersionId: schema.mods.currentVersionId })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  return row
}

export interface FakeGitHub extends GitHub {
  calls: string[]
}

interface FakeGitHubOptions {
  onDefaultBranch?: boolean
  filesChanged?: string[]
  /** Runs inside the default-branch lookup, between the script's reads and its write. */
  meanwhile?: () => Promise<void>
}

export function fakeGitHub(opts: FakeGitHubOptions = {}): FakeGitHub {
  const calls: string[] = []
  return {
    calls,
    async commitIsOnDefaultBranch(_repo, commit) {
      calls.push(`on-default:${commit}`)
      await opts.meanwhile?.()
      return opts.onDefaultBranch ?? true
    },
    async filesChanged(_repo, base, head) {
      calls.push(`files:${base}...${head}`)
      return opts.filesChanged ?? []
    },
    async commitIsFetchable() {
      throw new Error('publish and restore never ask whether a commit is fetchable')
    },
  }
}
