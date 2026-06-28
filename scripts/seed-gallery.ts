import '@/lib/refuse-in-production'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { user } from '@/db/auth-schema'
import { configs, renderJobs } from '@/db/schema'
import { E2BSandboxRunner } from '@/render/e2b-runner'
import { approveVersion } from '@/review/decide'
import { submitConfig } from '@/submit/submit'
import { processNextRenderJob } from '@/submit/worker'

/** Seeds are authored by the site owner — the first admin, else the first user. */
async function seedAuthorId(): Promise<string> {
  const users = await db.select().from(user)
  const author = users.find((u) => u.role === 'admin') ?? users[0]
  if (!author) throw new Error('No user to author seeds — sign in once first.')
  return author.id
}

const SEED_CONFIGS = [
  {
    title: 'Minimal',
    description:
      'Model, folder, and git branch — nothing else. Example statusline inspired by the Claude Code docs (code.claude.com/docs/en/statusline).',
    source: [
      '#!/usr/bin/env bash',
      'json=$(cat)',
      'model=$(echo "$json" | jq -r ".model.display_name")',
      'dir=$(echo "$json" | jq -r ".workspace.current_dir")',
      'branch=$(git branch --show-current 2>/dev/null)',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: bash parameter expansion, not JS
      'printf "%s · %s%s" "$model" "${dir##*/}" "${branch:+ on $branch}"',
    ].join('\n'),
  },
  {
    title: 'Context Bar',
    description:
      'Model plus a 10-block context-usage bar. Example statusline inspired by the Claude Code docs (code.claude.com/docs/en/statusline).',
    source: [
      '#!/usr/bin/env bash',
      'json=$(cat)',
      'model=$(echo "$json" | jq -r ".model.display_name")',
      'pct=$(echo "$json" | jq -r ".context_window.used_percentage // 0" | cut -d. -f1)',
      'filled=$((pct / 10))',
      'bar=""',
      // ▓ = U+2593 (e2 96 93), ░ = U+2591 (e2 96 91) as UTF-8 hex — printf %b expands \x, not \u.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable append, not JS
      'for i in $(seq 1 10); do [ "$i" -le "$filled" ] && bar="${bar}\\xe2\\x96\\x93" || bar="${bar}\\xe2\\x96\\x91"; done',
      'printf "%s  %b %s%%" "$model" "$bar" "$pct"',
    ].join('\n'),
  },
  {
    title: 'Cost & Branch',
    description:
      'Color-coded model, branch, context %, and session cost. Example statusline inspired by the Claude Code docs (code.claude.com/docs/en/statusline).',
    source: [
      '#!/usr/bin/env bash',
      'json=$(cat)',
      'model=$(echo "$json" | jq -r ".model.display_name")',
      'branch=$(git branch --show-current 2>/dev/null || echo "-")',
      'pct=$(echo "$json" | jq -r ".context_window.used_percentage // 0" | cut -d. -f1)',
      'cost=$(echo "$json" | jq -r ".cost.total_cost_usd")',
      'printf "\\033[36m%s\\033[0m  \\033[32m%s\\033[0m  \\033[33m%s%%\\033[0m  \\033[35m\\$%s\\033[0m" "$model" "$branch" "$pct" "$cost"',
    ].join('\n'),
  },
]

async function seedGallery(): Promise<void> {
  const runner = new E2BSandboxRunner()
  const authorId = await seedAuthorId()

  for (const cfg of SEED_CONFIGS) {
    // Idempotency: skip if a config with this title already exists.
    const existing = await db.select().from(configs).where(eq(configs.title, cfg.title))
    if (existing.length > 0) {
      console.log(`[skip] "${cfg.title}" — already exists (slug: ${existing[0]?.slug ?? '?'})`)
      continue
    }

    console.log(`\n[seed] Submitting "${cfg.title}"…`)
    const { configId, versionId, slug } = await submitConfig(db, {
      authorId,
      title: cfg.title,
      description: cfg.description,
      interpreter: 'bash',
      source: cfg.source,
    })
    console.log(`  → configId: ${configId}, versionId: ${versionId}, slug: ${slug}`)

    console.log(`  → Rendering via E2B (8 scenarios)…`)
    const jobId = await processNextRenderJob(db, runner)
    if (!jobId) {
      console.error(`  [ERROR] No render job was claimed for "${cfg.title}" — skipping publish.`)
      continue
    }

    // Check whether the render job succeeded.
    const [job] = await db
      .select()
      .from(renderJobs)
      .where(eq(renderJobs.configVersionId, versionId))
    if (!job) {
      console.error(`  [ERROR] Render job not found for version ${versionId} — skipping publish.`)
      continue
    }
    if (job.status !== 'done') {
      console.error(
        `  [ERROR] Render job status="${job.status}" for "${cfg.title}" — skipping publish.`,
      )
      if (job.error) console.error(`  Job error: ${job.error}`)
      continue
    }

    console.log(`  → Render done. Approving + publishing…`)
    await approveVersion(db, versionId, authorId)
    console.log(`  [published] "${cfg.title}" → /${slug}`)
  }

  console.log('\nSeed complete.')
  process.exit(0)
}

seedGallery().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
