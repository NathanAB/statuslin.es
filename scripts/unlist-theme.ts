import { parseArgs } from 'node:util'
import { and, desc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Leave one terminal theme of a plugin unlisted, with the reason, so the plugin's other themes can
 * publish: a theme render:mods can't record (one that only changes colours the theme scene never
 * draws records the same as no theme and is refused) otherwise holds back its whole version. The
 * theme stays in the plugin people install; it records no preview, shows no card, and publish no
 * longer waits for it. Any preview it had is removed with it.
 *
 * It acts on the mod's newest version, the one render:mods and publish-mod work on. A new version
 * (a re-pin) carries its themes afresh, all listed, so a theme left out stays out only for the
 * version it was unlisted on.
 *
 * AGENT USAGE (needs DATABASE_URL; the operator decides which theme and why):
 *
 *   bun run scripts/unlist-theme.ts <slug> <theme-key> --reason "<why>"
 *
 * The <theme-key> is the theme file's name in the plugin's themes/ folder, without `.json`. Exit
 * code 0 when the theme was unlisted, 1 on a missing reason, an unknown mod or theme, or any error.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const USAGE = 'Usage: bun run scripts/unlist-theme.ts <slug> <theme-key> --reason "<why>"'

export async function unlistTheme(
  db: Db,
  { slug, key, reason }: { slug: string; key: string; reason: string },
): Promise<{ versionNumber: number }> {
  const why = reason.trim()
  if (why === '') throw new Error('give the reason the theme is left out with --reason "<why>"')
  const [version] = await db
    .select({ id: schema.modVersions.id, versionNumber: schema.modVersions.versionNumber })
    .from(schema.modVersions)
    .innerJoin(schema.mods, eq(schema.mods.id, schema.modVersions.modId))
    .where(eq(schema.mods.slug, slug))
    .orderBy(desc(schema.modVersions.versionNumber))
    .limit(1)
  if (!version) throw new Error(`no mod with slug "${slug}" has a version`)
  return db.transaction(async (tx) => {
    const [theme] = await tx
      .update(schema.modThemes)
      .set({ unlistedReason: why })
      .where(
        and(
          eq(schema.modThemes.modVersionId, version.id),
          eq(schema.modThemes.kind, 'terminal'),
          eq(schema.modThemes.key, key),
        ),
      )
      .returning({ id: schema.modThemes.id })
    if (!theme) throw new Error(`no terminal theme "${key}" on ${slug} v${version.versionNumber}`)
    await tx.delete(schema.modThemePreviews).where(eq(schema.modThemePreviews.themeId, theme.id))
    return { versionNumber: version.versionNumber }
  })
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: { reason: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  })
  const [slug, key] = positionals
  if (!slug || !key || positionals.length !== 2 || values.reason === undefined) {
    console.error(USAGE)
    return 1
  }
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    const { versionNumber } = await unlistTheme(db, { slug, key, reason: values.reason })
    console.log(
      terminalLine(`unlisted theme ${key} of ${slug} v${versionNumber}: ${values.reason}`),
    )
    return 0
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(terminalLine(`[unlist-theme] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
