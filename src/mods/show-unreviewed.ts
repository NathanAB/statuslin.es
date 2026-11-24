import { and, count, eq, isNull, ne, or, type SQLWrapper, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { unreviewedModPath } from '@/lib/site'
import { CURATION_FILE, type CurationEntry } from './curation'
import { hasSubmission } from './import'
import { versionIsRendered } from './queries'
import { terminalLine } from './terminal-line'
import { repoOwner } from './unreviewed'
import { refusedBefore } from './unreviewed-import'
import { hasUnreviewedPage, versionOwner } from './unreviewed-queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface ShowUnreviewedDeps {
  db: Db
  /** src/mods/curation.json, parsed. */
  curation: CurationEntry[]
  log: (line: string) => void
}

const USAGE = `Usage: bun run show:unreviewed-mods <slug>... [--apply] [--hide]
  default   dry run: say what each slug's unreviewed page would be, or why it can't have one
  --apply   show each draft as an unreviewed mod (ADR 0014)
  --hide    take each page down instead, for a removal request`

const { mods, modThemes, modVersions, unreviewedMods } = schema

type Draft = { id: string; address: string; themes: number; shown: boolean }

/** The curated draft at `slug`, if it may have an unreviewed page; otherwise why not. */
async function checkDraft(
  db: Db,
  slug: string,
  curation: CurationEntry[],
): Promise<Draft | { refusal: string }> {
  const [mod] = await db
    .select({
      id: mods.id,
      status: mods.status,
      pluginName: mods.pluginName,
      shownAt: mods.unreviewedPageAt,
      submitted: hasSubmission(db),
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      commitSha: modVersions.commitSha,
      versionId: modVersions.id,
      rendered: sql<boolean>`${versionIsRendered}`,
    })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .where(eq(mods.slug, slug))
  if (!mod) return { refusal: 'no mod has this slug' }
  if (mod.status !== 'draft') return { refusal: `it is ${mod.status}, not a draft` }
  if (mod.submitted) return { refusal: 'a user submitted it: review it on /admin' }
  const entry = curation.find(
    (e) => e.repoUrl === mod.repoUrl && e.path === mod.path && e.pluginName === mod.pluginName,
  )
  if (!entry) return { refusal: `${CURATION_FILE} has no entry for its folder and plugin name` }
  if (entry.commitSha !== mod.commitSha) {
    return {
      refusal: `its live commit ${mod.commitSha} is not the curation file's ${entry.commitSha}`,
    }
  }
  const [themes] = await db
    .select({ n: count() })
    .from(modThemes)
    .where(and(eq(modThemes.modVersionId, mod.versionId), eq(modThemes.kind, 'desktop')))
  if (!themes?.n) return { refusal: 'its live version declares no Desktop theme' }
  if (!mod.rendered) return { refusal: 'its live version is not fully recorded: render it first' }
  const refused = await refusedBefore(db, mod)
  if (refused) return { refusal: refused }

  const owner = repoOwner(mod.repoUrl)
  const address = unreviewedModPath(owner, mod.pluginName)
  const sameAddress = (ownerColumn: SQLWrapper) => sql`lower(${ownerColumn}) = lower(${owner})`
  const [row] = await db
    .select({ id: unreviewedMods.id })
    .from(unreviewedMods)
    .where(and(eq(unreviewedMods.pluginName, mod.pluginName), sameAddress(unreviewedMods.owner)))
  const [twin] = await db
    .select({ id: mods.id })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .where(
      and(
        ne(mods.id, mod.id),
        eq(mods.pluginName, mod.pluginName),
        sameAddress(versionOwner),
        // A published listing there would take the address over with a redirect.
        or(hasUnreviewedPage(db), eq(mods.status, 'published')),
      ),
    )
  if (row || twin) return { refusal: `${address} already belongs to another mod` }
  return { id: mod.id, address, themes: themes.n, shown: mod.shownAt !== null }
}

async function show(db: Db, slug: string, curation: CurationEntry[], apply: boolean) {
  const draft = await checkDraft(db, slug, curation)
  if ('refusal' in draft) return { ok: false, line: `refused ${slug}: ${draft.refusal}` }
  const themes = `${draft.themes} Desktop ${draft.themes === 1 ? 'theme' : 'themes'}`
  if (draft.shown) return { ok: true, line: `unchanged ${slug}: already shown at ${draft.address}` }
  if (!apply) {
    return {
      ok: true,
      line: `would show ${slug} at ${draft.address} with ${themes} (dry run: add --apply)`,
    }
  }
  // Only while it is still a draft: a publish in between makes it a listing.
  const updated = await db
    .update(mods)
    .set({ unreviewedPageAt: new Date() })
    .where(and(eq(mods.id, draft.id), eq(mods.status, 'draft'), isNull(mods.unreviewedPageAt)))
    .returning({ id: mods.id })
  if (updated.length === 0) return { ok: false, line: `refused ${slug}: it changed meanwhile` }
  return { ok: true, line: `showed ${slug} at ${draft.address} with ${themes}` }
}

async function hide(db: Db, slug: string, apply: boolean) {
  const [mod] = await db
    .select({ id: mods.id, shownAt: mods.unreviewedPageAt })
    .from(mods)
    .where(eq(mods.slug, slug))
  if (!mod) return { ok: false, line: `refused ${slug}: no mod has this slug` }
  if (mod.shownAt === null) return { ok: true, line: `unchanged ${slug}: not shown` }
  if (!apply) return { ok: true, line: `would hide ${slug} (dry run: add --apply)` }
  await db.update(mods).set({ unreviewedPageAt: null }).where(eq(mods.id, mod.id))
  return { ok: true, line: `hid ${slug}` }
}

/**
 * Shows curated Desktop theme drafts as unreviewed mods, or with `--hide` takes their pages down
 * (ADR 0014). Each slug is checked on its own; exit code 1 when any is refused.
 */
export async function runShowUnreviewed(
  argv: string[],
  { db, curation, log }: ShowUnreviewedDeps,
): Promise<number> {
  const slugs = argv.filter((a) => !a.startsWith('--'))
  if (slugs.length === 0) {
    for (const line of USAGE.split('\n')) log(line)
    return 1
  }
  const apply = argv.includes('--apply')
  let exitCode = 0
  for (const slug of slugs) {
    const result = argv.includes('--hide')
      ? await hide(db, slug, apply)
      : await show(db, slug, curation, apply)
    log(terminalLine(result.line))
    if (!result.ok) exitCode = 1
  }
  return exitCode
}
