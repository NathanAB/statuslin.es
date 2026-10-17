import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/db/schema'
import type { GitHub } from '@/mods/github'
import { MOD_SCENARIO_KEY } from '@/mods/queries'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

export const REPO_URL = 'https://github.com/octocat/meter'

export async function openTestDb(): Promise<{
  db: TestDb
  client: PGlite
  close: () => Promise<void>
}> {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return { db, client, close: () => client.close() }
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

/** The terminal preview `addVersion` stores for a version seeded as rendered. */
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
  // Rendered means publishable: a result on both surfaces. Desktop drew nothing unless a test adds a shot.
  if (seed.rendered ?? true) {
    await db.insert(schema.modPreviews).values({
      modVersionId: versionId,
      scenarioKey: MOD_SCENARIO_KEY,
      ...SEEDED_PREVIEW,
    })
    await addDesktopPreview(db, versionId, 'nothing')
  }
  return versionId
}

/** The shot `addDesktopPreview` stores, with its card. The shot is a real 1x1 PNG, so a card can
 * draw it; the card's bytes only start with the PNG signature. */
export const SEEDED_DESKTOP_SHOT = {
  png: new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOUl5P9DwACGQFbbftqRAAAAABJRU5ErkJggg==',
      'base64',
    ),
  ),
  width: 790,
  height: 52,
  cardPng: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 43]),
  cardWidth: 790,
  cardHeight: 40,
}

/** Sets the version's clean-main Desktop result: a shot, or that it drew nothing. */
export async function addDesktopPreview(
  db: TestDb,
  versionId: string,
  result: 'shot' | 'nothing' = 'shot',
) {
  const row =
    result === 'shot'
      ? { kind: 'shot' as const, ...SEEDED_DESKTOP_SHOT }
      : {
          kind: 'nothing' as const,
          png: null,
          width: null,
          height: null,
          cardPng: null,
          cardWidth: null,
          cardHeight: null,
        }
  await db
    .insert(schema.modDesktopPreviews)
    .values({
      modVersionId: versionId,
      scenarioKey: MOD_SCENARIO_KEY,
      desktopVersion: '1.0.0',
      engineVersion: '2.1.0',
      ...row,
    })
    .onConflictDoUpdate({
      target: [schema.modDesktopPreviews.modVersionId, schema.modDesktopPreviews.scenarioKey],
      set: row,
    })
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

/**
 * What the inspect sandbox's components command prints (src/mods/plugin-components.ts): a NUL-ended
 * `<type> <size> <path>` record per file, then hooks/hooks.json.
 */
export function componentsListing(records: string[], hooksJson: string): string {
  return `${records.map((record) => `${record}\0`).join('')}\0--- hooks/hooks.json ---\0${hooksJson}`
}

/** A plugin made of one hooks module, with plugin.json and hooks/hooks.json, plus `records`. */
export function modulesOnlyListing(
  module: string,
  records: string[] = [],
  hooksJson = `{ "modules": ["${module}"] }`,
  hooksSize = hooksJson.length,
): string {
  const files = ['d 4096 .claude-plugin', 'f 20 .claude-plugin/plugin.json', 'd 4096 hooks']
  const hooks = [`f ${hooksSize} hooks/hooks.json`, `f 900 hooks/${module.slice(2)}`]
  return componentsListing([...files, ...hooks, ...records], hooksJson)
}

/** The listing for the skins validate report's one module (test/mods/fixtures/validate-skins.json). */
export const MODULES_ONLY_LISTING = modulesOnlyListing('./register.tsx')
