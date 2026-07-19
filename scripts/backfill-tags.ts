import { and, asc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { buildTagsPrompt, parseSuggestedTags } from '@/content/tags'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { requireEnv } from '@/lib/env'
import { getPreviews } from '@/render/store'
import { type RunPrompt, runClaude } from './claude-prompt'

/**
 * Suggest facet tags for published configs that have none, via the local `claude` CLI
 * (same Max-plan, no-API-key setup as generate-content; `runClaude` and its prompt-injection
 * hardening are imported from there, one copy). Dry run by default: prints the slug → tags
 * table and changes nothing. Re-run with --write to persist. Point DATABASE_URL at the
 * target env (staging first, then prod), like the other backfills.
 *
 * Known limitation: "tags = []" means both "never suggested" and "suggested, none apply",
 * so configs the model legitimately gave no tags are re-prompted on every run. Fine at
 * ~23 configs; add a suggested-at timestamp if the gallery grows past caring.
 * Note: --write re-prompts the model rather than replaying the dry run, so written tags
 * can differ from a prior dry-run table; the --write output is the authoritative record.
 *
 *   bun run scripts/backfill-tags.ts            # dry run: print suggestions
 *   bun run scripts/backfill-tags.ts --write    # suggest AND store
 *   bun run scripts/backfill-tags.ts --all-tags # recompute allTags for every published config (no model call)
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Published configs whose tags are still the empty default. */
export async function listPublishedSlugsMissingTags(db: Db): Promise<string[]> {
  const rows = await db
    .select({ slug: schema.configs.slug })
    .from(schema.configs)
    .where(and(eq(schema.configs.status, 'published'), sql`${schema.configs.tags} = '[]'::jsonb`))
    .orderBy(asc(schema.configs.createdAt))
  return rows.map((r) => r.slug)
}

/** Build the prompt from the config's source + previews, run it, validate, return. No write. */
export async function suggestTags(db: Db, slug: string, runPrompt: RunPrompt): Promise<string[]> {
  const [row] = await db
    .select({ config: schema.configs, version: schema.configVersions })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(eq(schema.configs.slug, slug))
  if (!row) throw new Error(`no config found with slug "${slug}"`)
  const previews = await getPreviews(db, row.version.contentSha256)
  const prompt = buildTagsPrompt({
    title: row.config.title,
    description: row.config.description,
    source: row.version.source,
    previewLines: previews.map((p) => p.segments.map((s) => s.text).join('')),
  })
  return parseSuggestedTags(await runPrompt(prompt))
}

/** suggestTags, then persist to configs.tags and recompute configs.allTags to match. */
export async function suggestAndStoreTags(
  db: Db,
  slug: string,
  runPrompt: RunPrompt,
): Promise<string[]> {
  const tags = await suggestTags(db, slug, runPrompt)
  const [row] = await db
    .select({ id: schema.configs.id, version: schema.configVersions })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(eq(schema.configs.slug, slug))
  const allTags = row
    ? computeAllTags({
        curatedTags: tags,
        interpreter: row.version.interpreter,
        networkHosts: row.version.networkHosts ?? [],
        readsClaudeToken: row.version.readsClaudeToken ?? false,
      })
    : tags
  await db.update(schema.configs).set({ tags, allTags }).where(eq(schema.configs.slug, slug))
  return tags
}

/** Recompute allTags for every published config from its current version + existing curated tags.
 * No model call — pure derivation. Run once after deploying the allTags column. */
export async function backfillAllTags(db: Db): Promise<number> {
  const rows = await db
    .select({ id: schema.configs.id, tags: schema.configs.tags, version: schema.configVersions })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(eq(schema.configs.status, 'published'))
  for (const row of rows) {
    const allTags = computeAllTags({
      curatedTags: row.tags ?? [],
      interpreter: row.version.interpreter,
      networkHosts: row.version.networkHosts ?? [],
      readsClaudeToken: row.version.readsClaudeToken ?? false,
    })
    await db.update(schema.configs).set({ allTags }).where(eq(schema.configs.id, row.id))
  }
  return rows.length
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const allTags = process.argv.includes('--all-tags')
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    if (allTags) {
      const count = await backfillAllTags(db)
      console.log(`[backfill-tags] recomputed allTags for ${count} published config(s)`)
      return
    }
    const slugs = await listPublishedSlugsMissingTags(db)
    if (slugs.length === 0) {
      console.log('[backfill-tags] nothing to do — every published config has tags')
      return
    }
    for (const slug of slugs) {
      const tags = write
        ? await suggestAndStoreTags(db, slug, runClaude)
        : await suggestTags(db, slug, runClaude)
      console.log(`${slug}  →  ${JSON.stringify(tags)}${write ? '  (written)' : ''}`)
    }
    if (!write) console.log('\n[backfill-tags] dry run — re-run with --write to store these')
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`[backfill-tags] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
