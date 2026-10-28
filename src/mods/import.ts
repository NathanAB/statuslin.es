import { and, eq, exists, max, not, type SQL } from 'drizzle-orm'
import { alias, type PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { CardSurface } from '@/lib/card-surface'
import { HttpError } from '@/lib/http'
import type { withModSandbox } from '@/render/mods/mod-sandbox'
import type { InputStep } from './curation'
import { inspectPlugin, type PluginFacts } from './plugin-facts'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A plugin folder pinned to a commit: what one mod version is built from. */
export interface PinnedSource {
  repoUrl: string
  path: string
  commitSha: string
}

/**
 * The plugin folder at the commit as `.tar.gz` bytes, one top-level folder holding `<path>/…`:
 * data only, never unpacked on the host.
 */
export type FetchPlugin = (source: PinnedSource) => Promise<Uint8Array>

/** What reading a pinned plugin needs: its fetch and an offline sandbox to read it in. */
export interface InspectDeps {
  fetchPlugin: FetchPlugin
  withSandbox: typeof withModSandbox
}

/** The slug of the mod that already has a version at this repository, folder and commit. */
const submittedVersion = alias(schema.modVersions, 'submitted_version')

/**
 * The mod was submitted by a user: one of its versions has a submission. Curated mods have none,
 * and the curated scripts leave submitted ones to review on /admin.
 */
export function hasSubmission(db: Db): SQL {
  return exists(
    db
      .select({ id: schema.submissions.id })
      .from(schema.submissions)
      .innerJoin(submittedVersion, eq(submittedVersion.id, schema.submissions.modVersionId))
      .where(eq(submittedVersion.modId, schema.mods.id)),
  )
}

/** The curated mod already built from this commit; a user's submission of it doesn't count. */
export async function importedSlug(db: Db, source: PinnedSource): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: schema.mods.slug })
    .from(schema.modVersions)
    .innerJoin(schema.mods, eq(schema.mods.id, schema.modVersions.modId))
    .where(
      and(
        eq(schema.modVersions.repoUrl, source.repoUrl),
        eq(schema.modVersions.path, source.path),
        eq(schema.modVersions.commitSha, source.commitSha),
        not(hasSubmission(db)),
      ),
    )
  return row?.slug
}

/**
 * Fetches the plugin folder at the commit and reads it in an offline sandbox: its plugin.json and
 * `claude plugin validate`'s footprint. Nothing from the fetch runs on the host.
 */
export async function inspectSource(
  source: PinnedSource,
  { fetchPlugin, withSandbox }: InspectDeps,
): Promise<PluginFacts> {
  const tarball = await fetchPlugin(source)
  return withSandbox({ tarball, path: source.path }, inspectPlugin)
}

async function slugTaken(db: Db, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.mods.id })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  return row !== undefined
}

/** The plugin's own name, or `<name>-<owner>` when another mod has it (ADR 0005). */
export async function pickSlug(db: Db, name: string, owner: string): Promise<string> {
  if (!(await slugTaken(db, name))) return name
  const withOwner = `${name}-${owner}`
  if (!(await slugTaken(db, withOwner))) return withOwner
  throw new HttpError(409, `"${name}" and "${withOwner}" are both taken by other mods`)
}

export interface NewVersion {
  modId: string
  versionId: string
  source: PinnedSource
  facts: PluginFacts
  license: string | null
  inputSteps: InputStep[]
  /** Left out for a submitted mod, whose card keeps the default. */
  cardSurface?: CardSurface | undefined
}

/** Adds the mod's next version; returns its number. */
export async function insertNextVersion(db: Db, version: NewVersion): Promise<number> {
  const [latest] = await db
    .select({ versionNumber: max(schema.modVersions.versionNumber) })
    .from(schema.modVersions)
    .where(eq(schema.modVersions.modId, version.modId))
  const next = (latest?.versionNumber ?? 0) + 1
  await db.insert(schema.modVersions).values({
    id: version.versionId,
    modId: version.modId,
    versionNumber: next,
    ...version.source,
    pluginVersion: version.facts.manifest.version,
    license: version.license,
    footprint: version.facts.footprint,
    validatedWith: version.facts.claudeCodeVersion,
    inputSteps: version.inputSteps,
    cardSurface: version.cardSurface,
  })
  return next
}

export interface NewMod {
  modId: string
  slug: string
  title: string
  /** The repository owner, credited as the author (ADR 0005). */
  owner: string
  facts: PluginFacts
  /** The first version, which the draft points at. */
  versionId: string
}

/** A draft mod pointing at its first version, which the caller inserts in the same transaction. */
export async function insertDraftMod(db: Db, mod: NewMod): Promise<void> {
  await db.insert(schema.mods).values({
    id: mod.modId,
    slug: mod.slug,
    pluginName: mod.facts.manifest.name,
    title: mod.title,
    description: mod.facts.manifest.description,
    authorGithub: mod.owner,
    status: 'draft',
    currentVersionId: mod.versionId,
  })
}
