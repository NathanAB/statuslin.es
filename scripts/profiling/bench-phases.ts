import { writeFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { getConfigBySlug, getPublishedConfigs, getPublishedCount } from '@/gallery/queries'
import { requireEnv } from '@/lib/env'
import { highlightSource } from '@/lib/highlight'
import { loadtestSlug, seedLoadConfigs } from '../loadtest/seed'
import { teardownLoadConfigs } from '../loadtest/teardown'

/**
 * Phase bench for the hot read paths — the part a CPU flamegraph can't show: how long each real
 * function actually takes, including time spent WAITING on Postgres. It imports the same functions
 * the routes call (`getPublishedCount` + `getPublishedConfigs` for the gallery; `getConfigBySlug`
 * + `highlightSource` for the detail page — see src/gallery/functions.ts) and times them against
 * the dev DB. Zero production code is touched; this only reads + calls existing functions.
 *
 * Run: `bun run profile:bench` (bun auto-loads .env for DATABASE_URL). Seeds a small set of
 * `loadtest-*` configs, measures, then tears them back down. Writes a markdown + JSON report to
 * scripts/profiling/results/.
 */

type Db = Parameters<typeof getPublishedConfigs>[0]

const SEED_COUNT = 50
const ITERS = 50

// A representative ~30-line bash statusline, so the Shiki number reflects a real config rather
// than the 5-line synthetic seed source (highlight cost scales with length).
const SAMPLE_SOURCE = `#!/usr/bin/env bash
# representative statusline for profiling
set -euo pipefail
json=$(cat)
model=$(echo "$json" | jq -r '.model.display_name')
dir=$(echo "$json" | jq -r '.workspace.current_dir')
branch=$(git -C "$dir" branch --show-current 2>/dev/null || echo '-')
pct=$(echo "$json" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
cost=$(echo "$json" | jq -r '.cost.total_cost_usd // 0')
bar=""
filled=$(( pct / 10 ))
for i in $(seq 1 10); do
  if [ "$i" -le "$filled" ]; then bar="\${bar}#"; else bar="\${bar}-"; fi
done
color_for_pct() {
  if [ "$1" -ge 80 ]; then printf '\\033[31m'; elif [ "$1" -ge 50 ]; then printf '\\033[33m'; else printf '\\033[32m'; fi
}
c=$(color_for_pct "$pct")
reset='\\033[0m'
printf '%b%s%b  %s  %s  %b%s%%%b  $%s' \\
  '\\033[36m' "$model" "$reset" "\${dir##*/}" "$branch" "$c" "$pct" "$reset" "$cost"
`

interface Summary {
  n: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  minMs: number
  maxMs: number
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return Number.NaN
  const rank = Math.ceil((p / 100) * sortedAsc.length)
  const i = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))
  const v = sortedAsc[i]
  return v === undefined ? Number.NaN : v
}

function summarize(samples: number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    n: sorted.length,
    meanMs: round(sum / sorted.length),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    minMs: round(sorted[0] ?? Number.NaN),
    maxMs: round(sorted[sorted.length - 1] ?? Number.NaN),
  }
}

const round = (n: number) => Math.round(n * 100) / 100

/** Run `fn` once to warm (JIT, connection, Shiki init), then time `iters` calls. */
async function bench(fn: () => Promise<unknown>, iters: number): Promise<number[]> {
  await fn()
  const samples: number[] = []
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now()
    await fn()
    samples.push(performance.now() - t0)
  }
  return samples
}

/** Count the queries a single call issues, via a logger-wired Drizzle over the same client. */
async function queriesPerCall(
  client: postgres.Sql,
  fn: (db: Db) => Promise<unknown>,
): Promise<number> {
  let count = 0
  const counted = drizzle({ client, schema, logger: { logQuery: () => count++ } }) as unknown as Db
  await fn(counted)
  return count
}

async function main(): Promise<void> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db

  console.log(`[profile:bench] seeding ${SEED_COUNT} loadtest configs into dev DB…`)
  await seedLoadConfigs(db, { count: SEED_COUNT })
  const slug = loadtestSlug(Math.ceil(SEED_COUNT / 2))

  try {
    const phases: Record<string, Summary> = {}
    phases['gallery: getPublishedCount'] = summarize(
      await bench(() => getPublishedCount(db), ITERS),
    )
    phases['gallery: getPublishedConfigs(new,p1)'] = summarize(
      await bench(() => getPublishedConfigs(db, 'new', 1), ITERS),
    )
    phases['detail: getConfigBySlug'] = summarize(
      await bench(() => getConfigBySlug(db, slug), ITERS),
    )
    // Shiki: cold (first call pays highlighter init) vs warm (steady state per request).
    const t0 = performance.now()
    await highlightSource(SAMPLE_SOURCE, 'bash')
    const shikiColdMs = round(performance.now() - t0)
    phases['detail: highlightSource (warm)'] = summarize(
      await bench(() => highlightSource(SAMPLE_SOURCE, 'bash'), ITERS),
    )

    const queryCounts = {
      getPublishedCount: await queriesPerCall(client, (d) => getPublishedCount(d)),
      getPublishedConfigs: await queriesPerCall(client, (d) => getPublishedConfigs(d, 'new', 1)),
      getConfigBySlug: await queriesPerCall(client, (d) => getConfigBySlug(d, slug)),
    }

    report(phases, queryCounts, shikiColdMs)
  } finally {
    console.log('[profile:bench] tearing down loadtest data…')
    await teardownLoadConfigs(db)
    await client.end()
  }
}

function report(
  phases: Record<string, Summary>,
  queryCounts: Record<string, number>,
  shikiColdMs: number,
): void {
  const lines: string[] = []
  lines.push(`# Phase bench — ${new Date().toISOString()}`)
  lines.push('')
  lines.push(
    `Shiki highlighter cold start (first highlight, paid once per process): **${shikiColdMs} ms**`,
  )
  lines.push('')
  lines.push('| Phase | n | mean | p50 | p95 | min | max |')
  lines.push('|-------|---|------|-----|-----|-----|-----|')
  for (const [name, s] of Object.entries(phases)) {
    lines.push(
      `| ${name} | ${s.n} | ${s.meanMs} | ${s.p50Ms} | ${s.p95Ms} | ${s.minMs} | ${s.maxMs} | (ms)`,
    )
  }
  lines.push('')
  lines.push('| Function | queries per call |')
  lines.push('|----------|------------------|')
  for (const [name, c] of Object.entries(queryCounts)) lines.push(`| ${name} | ${c} |`)
  const md = lines.join('\n')
  console.log(`\n${md}\n`)

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const stem = `scripts/profiling/results/${ts}.bench`
  writeFileSync(`${stem}.md`, `${md}\n`)
  writeFileSync(
    `${stem}.json`,
    `${JSON.stringify({ phases, queryCounts, shikiColdMs }, null, 2)}\n`,
  )
  console.log(`[profile:bench] wrote ${stem}.md / .json`)
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err)
      process.exit(1)
    },
  )
}
