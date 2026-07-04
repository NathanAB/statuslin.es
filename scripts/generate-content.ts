import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { buildContentPrompt } from '@/content/prompt'
import { type GeneratedContent, parseGeneratedContent } from '@/content/types'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { getPreviews } from '@/render/store'

/**
 * Generate the three content sections ("What it shows" / "Requirements" / "Behavior notes") for
 * config pages, from what the script observably does: its source, its submission metadata, and
 * its sandbox-rendered previews. Shells out to the local `claude` CLI in print mode — billed to
 * the signed-in Max plan; no ANTHROPIC_API_KEY is read or set anywhere.
 *
 * Run it manually per submission (after the worker has rendered previews) and as a backfill:
 *
 *   bun run generate:content <slug>      # (re)generate one config — always overwrites
 *   bun run generate:content --all       # every published config still missing content
 *   DATABASE_URL=<env-url> bun run generate:content --all   # a specific env (staging, prod/Neon)
 *
 * <slug> mode accepts any status (draft/pending/published) so content can be generated while a
 * submission is still in the review queue. --all is idempotent: it skips versions that already
 * have content, so a failed run can simply be re-run. Read the printed JSON before publishing —
 * a human reviews generated copy, per the spec. Exit code 0 on success, 1 on any error.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export type RunPrompt = (prompt: string) => Promise<string>

/** Read one config's current version + previews, run the prompt, validate, store, return. */
export async function generateContentForConfig(
  db: Db,
  slug: string,
  runPrompt: RunPrompt,
): Promise<GeneratedContent> {
  const [row] = await db
    .select({ config: schema.configs, version: schema.configVersions })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(eq(schema.configs.slug, slug))
  if (!row) throw new Error(`no config found with slug "${slug}"`)

  const previews = await getPreviews(db, row.version.contentSha256)
  const prompt = buildContentPrompt({
    title: row.config.title,
    description: row.config.description,
    interpreter: row.version.interpreter,
    source: row.version.source,
    networkHosts: row.version.networkHosts ?? [],
    readsClaudeToken: row.version.readsClaudeToken ?? false,
    previews,
  })
  const content = parseGeneratedContent(await runPrompt(prompt))
  await db
    .update(schema.configVersions)
    .set({ generatedContent: content })
    .where(eq(schema.configVersions.id, row.version.id))
  return content
}

/** Slugs for --all: published configs whose current version has no generated content yet. */
export async function listPublishedSlugsMissingContent(db: Db): Promise<string[]> {
  const rows = await db
    .select({ slug: schema.configs.slug })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(
      and(eq(schema.configs.status, 'published'), isNull(schema.configVersions.generatedContent)),
    )
    .orderBy(asc(schema.configs.createdAt))
  return rows.map((r) => r.slug)
}

/**
 * The real model call: local `claude` CLI, print mode, prompt on stdin. Deliberately untested.
 *
 * The prompt embeds untrusted submission text (script source + its stdout), so this runs with
 * `--tools ''` to disable all tool access — a prompt injection in a submission must not be able
 * to trigger tool use on the operator's machine. It also runs with `cwd: tmpdir()`, outside the
 * repo, so project-level agent settings (e.g. `.claude/settings.json`) don't apply to this call.
 */
const runClaude: RunPrompt = async (prompt) => {
  const res = spawnSync('claude', ['-p', '--tools', ''], {
    cwd: tmpdir(),
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (res.error) throw new Error(`failed to run \`claude\`: ${res.error.message}`)
  if (res.status !== 0) throw new Error(`claude -p exited ${res.status}: ${res.stderr}`)
  return res.stdout
}

const USAGE = `Usage: bun run scripts/generate-content.ts <slug> | --all
  <slug>   (re)generate content for one config (any status; always overwrites)
  --all    backfill every published config still missing content (skips ones that have it)`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const slug = args.find((a) => !a.startsWith('--'))
  if (!all && !slug) {
    console.error(USAGE)
    process.exit(1)
  }

  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    const slugs = all ? await listPublishedSlugsMissingContent(db) : [slug as string]
    if (slugs.length === 0) {
      console.log('[generate-content] nothing to do — every published config already has content')
    }
    for (const s of slugs) {
      console.log(`[generate-content] ${s}: running claude -p …`)
      const content = await generateContentForConfig(db, s, runClaude)
      console.log(JSON.stringify(content, null, 2))
    }
  } finally {
    await client.end()
  }
}

// Only run when invoked directly; importing this file (e.g. from the test) must not run main.
if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`[generate-content] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
