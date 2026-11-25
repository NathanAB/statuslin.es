import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { and, eq, inArray, not, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import {
  CURATION_FILE,
  type CurationEntry,
  desktopThemesCheckedAt,
  parseCuration,
} from '@/mods/curation'
import { createGitHub, type GitHubSource } from '@/mods/github'
import {
  checkDesktopThemes,
  type FetchPlugin,
  hasSubmission,
  importedSlug,
  insertDesktopThemes,
  insertDraftMod,
  insertNextVersion,
  inspectSource,
  pickSlug,
} from '@/mods/import'
import { terminalLine } from '@/mods/terminal-line'
import { MAX_INPUT_STEPS } from '@/render/mods/desktop/drive'
import { withModSandbox } from '@/render/mods/mod-sandbox'
import { createPluginFetcher } from '@/render/mods/plugin-checkout'
import type { DesktopTheme } from '@/themes/theme'

/**
 * Import the curated mods as drafts. For each entry in the curation file it downloads the
 * repository at the pinned commit, unpacks it in an offline E2B sandbox, runs that sandbox's
 * `claude plugin validate --json` for the footprint, reads plugin.json, and writes a draft mod with
 * its first version, one transaction per mod. Publishing is separate (scripts/publish-mod.ts).
 *
 * An entry re-pinned to a new commit of an existing mod (same plugin name and repository) adds that
 * commit as the mod's next version and changes nothing else: the current version stays live until
 * publish-mod.ts makes the new one current, after render:mods has rendered it. A plugin name that
 * another mod already uses, from another repository, makes a new mod. A mod's slug is its
 * marketplace entry name: the plugin's own name, or `<name>-<owner>` when another mod has that
 * (ADR 0005).
 *
 * An entry's `desktopThemes` are stored with its version, one Desktop theme each, with the switch
 * steps render:mods sends to record it and its card shows. They are refused for a mod whose
 * footprint sets no theme. A re-pin of a mod that declares them is refused until its
 * `desktopThemesCheckedAt` names the new commit: a release can add or rename a theme.
 *
 * Idempotent: an entry whose repository, path and commit are already imported is skipped without a
 * request, so rerunning the same file changes nothing. If only its `desktopThemes`, `inputSteps` or
 * `terminal` changed, they are stored on that version in place, and its previews need rendering
 * again (render:mods --slug); a changed Desktop theme loses its old preview. A changed `cardSurface` is stored in place too, and needs no render. The
 * whole file's format is checked before anything is fetched or written; an entry refused later is
 * reported and the others still import.
 *
 * AGENT USAGE (needs E2B_API_KEY and DATABASE_URL):
 *
 *   bun run import:mods [curation-file]      # default src/mods/curation.json
 *
 * Exit code 0 when every entry imported or was already there, 1 when any was refused.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface ImportDeps {
  db: Db
  github: Pick<GitHubSource, 'repoInfo'>
  fetchPlugin: FetchPlugin
  withSandbox: typeof withModSandbox
  log: (line: string) => void
}

/**
 * The curated mod an entry re-pins: the one with its plugin name whose current version is from its
 * repository. A mod a user submitted is theirs to update (ADR 0005), so it is never re-pinned here.
 */
async function modToRepin(
  db: Db,
  entry: CurationEntry,
): Promise<{ id: string; slug: string } | undefined> {
  const rows = await db
    .select({ id: schema.mods.id, slug: schema.mods.slug })
    .from(schema.mods)
    .innerJoin(schema.modVersions, eq(schema.modVersions.id, schema.mods.currentVersionId))
    .where(
      and(
        eq(schema.mods.pluginName, entry.pluginName),
        eq(schema.modVersions.repoUrl, entry.repoUrl),
        not(hasSubmission(db)),
      ),
    )
  if (rows.length > 1) {
    throw new Error(
      `${rows.length} curated mods are "${entry.pluginName}" from ${entry.repoUrl}: ${rows.map((r) => r.slug).join(', ')}`,
    )
  }
  return rows[0]
}

/** The curated versions already built from the entry's commit; a user's submission of it is theirs. */
function curatedVersionOf(db: Db, entry: CurationEntry): SQL | undefined {
  return and(
    eq(schema.modVersions.repoUrl, entry.repoUrl),
    eq(schema.modVersions.path, entry.path),
    eq(schema.modVersions.commitSha, entry.commitSha),
    inArray(
      schema.modVersions.modId,
      db
        .select({ id: schema.mods.id })
        .from(schema.mods)
        .where(not(hasSubmission(db))),
    ),
  )
}

/**
 * Stores an entry's input steps on the curated version already built from its commit, when they
 * changed. They only drive the preview recording, so the version stays the same one.
 */
async function updateInputSteps(db: Db, entry: CurationEntry): Promise<boolean> {
  const updated = await db
    .update(schema.modVersions)
    .set({ inputSteps: entry.inputSteps })
    .where(
      and(
        curatedVersionOf(db, entry),
        sql`${schema.modVersions.inputSteps} is distinct from ${JSON.stringify(entry.inputSteps)}::jsonb`,
      ),
    )
    .returning({ id: schema.modVersions.id })
  return updated.length > 0
}

/** Stores the terminal an entry records its terminal preview in, when it changed. */
async function updateTerminal(db: Db, entry: CurationEntry): Promise<boolean> {
  // SQL NULL for a missing setup: JSON.stringify(null) would compare as the jsonb 'null', which is
  // distinct from the stored NULL, and every rerun would report an update.
  const stored = entry.terminal ? JSON.stringify(entry.terminal) : null
  const updated = await db
    .update(schema.modVersions)
    .set({ terminal: entry.terminal ?? null })
    .where(
      and(
        curatedVersionOf(db, entry),
        sql`${schema.modVersions.terminal} is distinct from ${stored}::jsonb`,
      ),
    )
    .returning({ id: schema.modVersions.id })
  return updated.length > 0
}

/** Stores the surface an entry picks for its gallery card, when it changed. The card reads it as is. */
async function updateCardSurface(db: Db, entry: CurationEntry): Promise<boolean> {
  const cardSurface = entry.cardSurface ?? null
  const updated = await db
    .update(schema.modVersions)
    .set({ cardSurface })
    .where(
      and(
        curatedVersionOf(db, entry),
        sql`${schema.modVersions.cardSurface} is distinct from ${cardSurface}`,
      ),
    )
    .returning({ id: schema.modVersions.id })
  return updated.length > 0
}

/** Refuses Desktop themes declared for a mod whose code sets none, or with more steps than fit. */
function checkDeclaredThemes(footprint: schema.ModFootprint, themes: DesktopTheme[]): void {
  checkDesktopThemes(footprint, themes)
  const long = themes.find((theme) => theme.switchSteps.length > MAX_INPUT_STEPS)
  if (long) {
    throw new Error(
      `Desktop theme "${long.key}" has ${long.switchSteps.length} switch steps; at most ${MAX_INPUT_STEPS} fit in a recording`,
    )
  }
}

const byKey = (a: DesktopTheme, b: DesktopTheme) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/** Compared in one order, whatever the database's collation sorted the stored themes by. */
export const desktopThemesUnchanged = (stored: DesktopTheme[], declared: DesktopTheme[]) =>
  isDeepStrictEqual([...stored].sort(byKey), [...declared].sort(byKey))

async function updateDesktopThemes(db: Db, entry: CurationEntry): Promise<boolean> {
  const declared = [...(entry.desktopThemes ?? [])].sort(byKey)
  const versions = await db
    .select({
      id: schema.modVersions.id,
      footprint: schema.modVersions.footprint,
      live: sql<boolean>`exists (select 1 from ${schema.mods} live where live.current_version_id = ${schema.modVersions}.id and live.status <> 'draft')`,
    })
    .from(schema.modVersions)
    .where(curatedVersionOf(db, entry))
  let changed = false
  for (const version of versions) {
    const rows = await db
      .select({
        key: schema.modThemes.key,
        name: schema.modThemes.name,
        window: schema.modThemes.window,
        switchSteps: schema.modThemes.switchSteps,
      })
      .from(schema.modThemes)
      .where(
        and(eq(schema.modThemes.modVersionId, version.id), eq(schema.modThemes.kind, 'desktop')),
      )
    const stored = rows.map((row) => ({ ...row, switchSteps: row.switchSteps ?? [] }))
    if (desktopThemesUnchanged(stored, declared)) continue
    // Its themes are live on /themes, and /admin reviews only a version that isn't live yet.
    if (version.live) {
      throw new Error(
        "Desktop themes of a live version can't change in place; re-pin to a new version or unpublish first",
      )
    }
    checkDeclaredThemes(version.footprint, declared)
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.modThemes)
        .where(
          and(eq(schema.modThemes.modVersionId, version.id), eq(schema.modThemes.kind, 'desktop')),
        )
      await insertDesktopThemes(tx, version.id, declared)
    })
    changed = true
  }
  return changed
}

async function updateImported(db: Db, entry: CurationEntry, imported: string): Promise<string> {
  const newThemes = await updateDesktopThemes(db, entry)
  const newSteps = await updateInputSteps(db, entry)
  const newTerminal = await updateTerminal(db, entry)
  const newSurface = await updateCardSurface(db, entry)
  if (newThemes || newSteps || newTerminal) {
    const changed = [
      newThemes && 'Desktop themes',
      newSteps && 'input steps',
      newTerminal && 'terminal',
      newSurface && 'card surface',
    ].filter(Boolean)
    return `updated ${imported}: new ${changed.join(' and ')} at ${entry.commitSha}; render it again (render:mods --slug ${imported})`
  }
  if (newSurface) {
    return `updated ${imported}: its card shows ${entry.cardSurface ?? 'the default'} first at ${entry.commitSha}; nothing to render`
  }
  return `unchanged ${imported}: already imported at ${entry.commitSha}`
}

async function importEntry(
  entry: CurationEntry,
  { db, github, fetchPlugin, withSandbox }: ImportDeps,
): Promise<string> {
  const name = entry.pluginName
  const imported = await importedSlug(db, entry)
  if (imported) return updateImported(db, entry, imported)
  const existing = await modToRepin(db, entry)
  if (existing && !desktopThemesCheckedAt(entry, entry.commitSha)) {
    throw new Error(
      `its desktopThemes aren't marked as checked at ${entry.commitSha}; read that commit's themes, fix the declarations, then set desktopThemesCheckedAt to it`,
    )
  }

  const repo = await github.repoInfo(entry.repoUrl)
  const canonical = `https://github.com/${repo.fullName}`
  if (canonical !== entry.repoUrl) throw new Error(`write the repository URL as ${canonical}`)
  const owner = repo.fullName.slice(0, repo.fullName.indexOf('/'))
  const slug = existing?.slug ?? (await pickSlug(db, name, owner))
  const facts = await inspectSource(entry, { fetchPlugin, withSandbox })
  if (facts.manifest.name !== name) {
    throw new Error(`plugin.json names the plugin "${facts.manifest.name}", not "${name}"`)
  }
  checkDeclaredThemes(facts.footprint, entry.desktopThemes ?? [])

  const versionId = randomUUID()
  const versionNumber = await db.transaction(async (tx) => {
    const modId = existing?.id ?? randomUUID()
    if (!existing) {
      await insertDraftMod(tx, { modId, slug, title: entry.title, owner, facts, versionId })
    }
    return insertNextVersion(tx, {
      modId,
      versionId,
      source: entry,
      facts,
      license: repo.license,
      inputSteps: entry.inputSteps,
      cardSurface: entry.cardSurface,
      terminal: entry.terminal,
      desktopThemes: entry.desktopThemes,
    })
  })
  const { events, calls } = facts.footprint
  return `imported ${slug} v${versionNumber} at ${entry.commitSha}: plugin ${facts.manifest.version ?? 'unversioned'}, license ${repo.license ?? 'none'}, ${events.length} events, ${calls.length} calls`
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function importMods(raw: unknown, deps: ImportDeps): Promise<number> {
  const log = (line: string) => deps.log(terminalLine(line))
  const curation = parseCuration(raw)
  if (!curation.ok) {
    for (const error of curation.errors) log(`refused ${error}`)
    log('nothing imported: fix the curation file first')
    return 1
  }

  let refused = 0
  for (const entry of curation.entries) {
    try {
      log(await importEntry(entry, deps))
    } catch (error) {
      refused++
      log(`refused ${entry.pluginName}: ${messageOf(error)}`)
    }
  }
  return refused === 0 ? 0 : 1
}

async function main(): Promise<number> {
  const file = process.argv[2] ?? CURATION_FILE
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await importMods(JSON.parse(readFileSync(file, 'utf8')), {
      db,
      github: createGitHub(),
      fetchPlugin: createPluginFetcher(),
      withSandbox: withModSandbox,
      log: (line) => console.log(line),
    })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(terminalLine(`[import-mods] ${messageOf(err)}`))
      process.exit(1)
    },
  )
}
