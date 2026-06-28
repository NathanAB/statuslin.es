/**
 * Re-render every published/pending config's current version against the current SCENARIOS and
 * replace its stored previews. Run this after changing src/render/scenarios.ts so existing gallery
 * entries pick up new scenarios. Uses real E2B when E2B_API_KEY is set, else the fake runner.
 *
 *   bun run rerender:previews
 *
 * Network configs (networkHosts non-empty) are SKIPPED: their preview is a frozen snapshot captured
 * once at admin review, and re-rendering them here would (a) run the script offline and overwrite the
 * good snapshot with broken/empty output, and (b) re-run untrusted network code with egress outside
 * the admin-approval flow. Both are wrong, so we leave their snapshot untouched.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { configs, configVersions } from '@/db/schema'
import { E2BSandboxRunner } from '@/render/e2b-runner'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { renderConfig } from '@/render/pipeline'
import { storePreviews } from '@/render/store'
import type { Interpreter, SandboxRunner } from '@/render/types'

// Exactly one row per published config: its live version (the one currentVersionId points to).
// Pending configs are rendered by the worker pipeline, so they don't need a backfill here.
const versions = await db
  .select({
    slug: configs.slug,
    interpreter: configVersions.interpreter,
    contentSha256: configVersions.contentSha256,
    source: configVersions.source,
    networkHosts: configVersions.networkHosts,
  })
  .from(configs)
  .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
  .orderBy(configs.createdAt)

const runner: SandboxRunner = process.env.E2B_API_KEY
  ? new E2BSandboxRunner()
  : new FakeSandboxRunner()

console.log(`re-rendering ${versions.length} config version(s)…`)
for (const v of versions) {
  if ((v.networkHosts ?? []).length > 0) {
    console.log(`  ${v.slug}: SKIPPED (network config — frozen snapshot preserved)`)
    continue
  }
  const previews = await renderConfig(
    { script: v.source, interpreter: v.interpreter as Interpreter },
    runner,
  )
  await storePreviews(db, v.contentSha256, previews)
  const bad = previews.filter((p) => p.exitCode !== 0 || p.timedOut).length
  console.log(`  ${v.slug}: ${previews.length} previews${bad ? `  ⚠ ${bad} nonzero/timeout` : ''}`)
}
process.exit(0)
