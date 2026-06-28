import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import { requireEnv } from '@/lib/env'

/**
 * Server-side metrics poller for a load-test run. Every ~2s it samples Fly's Prometheus API (CPU
 * busy %, the shared-vCPU throttle + burst balance, memory %, edge concurrency, request + 5xx
 * rates, machine count) and our own `pg_stat_activity` (connection pool saturation), and appends a
 * timestamped row to `results/<sha>-metrics.csv`. Run it in a second terminal alongside `k6 run
 * browse.js`, keyed by the same SHA, so the client-side latency and the server-side saturation sit
 * side by side. The DB query MUST hit the DIRECT (unpooled) Neon URL — through the pooler
 * `pg_stat_activity` shows the pooler's view, not the real backends.
 *
 * The pure helpers below (query builders, value extraction, CSV formatting, arg parsing) are unit
 * tested; the live Fly/DB calls run only via the CLI entry at the bottom.
 */

export const METRIC_COLUMNS = [
  'ts',
  'cpu_busy_pct',
  'cpu_throttle',
  'cpu_balance',
  'mem_used_pct',
  'concurrency',
  'http_req_rate',
  'http_5xx_rate',
  'machines',
  'db_total',
  'db_active',
  'db_idle',
] as const

type MetricColumn = (typeof METRIC_COLUMNS)[number]
export type MetricsRecord = Partial<Record<MetricColumn, number | string | null>>

const DEFAULT_DURATION_SECONDS = 600
const POLL_INTERVAL_MS = 2000
const RESULTS_DIR = 'scripts/loadtest/results'

function flagValue(argv: string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const idx = argv.indexOf(name)
  return idx >= 0 ? argv[idx + 1] : undefined
}

/** `--duration 600` / `--duration=10m` / `--duration 45s` → seconds (default 600). */
export function parseDurationSeconds(argv: string[]): number {
  const raw = flagValue(argv, '--duration')
  if (!raw) return DEFAULT_DURATION_SECONDS
  const m = /^(\d+)([smh]?)$/.exec(raw.trim())
  if (!m?.[1]) return DEFAULT_DURATION_SECONDS
  const n = Number(m[1])
  const mult = m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1
  return n * mult
}

export interface FlyQuery {
  column: MetricColumn
  query: string
}

/** PromQL for each Fly-derived column, scoped to `app`. Metric names are verified against Fly's
 * metrics reference. DB columns come from pg_stat_activity. */
export function buildFlyQueries(app: string): FlyQuery[] {
  const a = `app="${app}"`
  return [
    {
      column: 'cpu_busy_pct',
      query: `100*(1- sum(rate(fly_instance_cpu{${a},mode="idle"}[1m])) / sum(rate(fly_instance_cpu{${a}}[1m])))`,
    },
    { column: 'cpu_throttle', query: `rate(fly_instance_cpu_throttle{${a}}[1m])` },
    { column: 'cpu_balance', query: `fly_instance_cpu_balance{${a}}` },
    {
      column: 'mem_used_pct',
      query: `100*(1- fly_instance_memory_mem_available{${a}} / fly_instance_memory_mem_total{${a}})`,
    },
    { column: 'concurrency', query: `fly_app_concurrency{${a}}` },
    { column: 'http_req_rate', query: `sum(rate(fly_app_http_responses_count{${a}}[1m]))` },
    {
      column: 'http_5xx_rate',
      query: `sum(rate(fly_app_http_responses_count{${a},status=~"5.."}[1m]))`,
    },
    {
      column: 'machines',
      query: `count(count by (instance)(fly_instance_memory_mem_total{${a}}))`,
    },
  ]
}

/** Pull the scalar out of a Prometheus instant-query response, or null if there's no data. */
export function extractPromValue(json: unknown): number | null {
  const result = (json as { data?: { result?: Array<{ value?: [number, string] }> } })?.data?.result
  if (!Array.isArray(result) || result.length === 0) return null
  const raw = result[0]?.value?.[1]
  if (raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function csvHeader(): string {
  return METRIC_COLUMNS.join(',')
}

export function csvRow(record: MetricsRecord): string {
  return METRIC_COLUMNS.map((c) => {
    const v = record[c]
    return v === null || v === undefined ? '' : String(v)
  }).join(',')
}

/**
 * Neon's direct (unpooled) URL is the pooled one with `-pooler` removed from the host. We connect
 * un-pooled to read connection counts, because through the PgBouncer pooler `pg_stat_activity`
 * shows the pooler's view, not the real backends. Derived from `DATABASE_URL` so the run needs only
 * one DB URL (no separate `DIRECT_DATABASE_URL`); only the host changes, credentials/db/params stay.
 */
export function toDirectUrl(databaseUrl: string): string {
  const u = new URL(databaseUrl)
  u.hostname = u.hostname.replace('-pooler', '')
  return u.toString()
}

// ---- live polling (CLI only) -------------------------------------------------------------------

function flyToken(): string {
  const fromEnv = process.env.FLY_API_TOKEN
  if (fromEnv) return fromEnv
  try {
    return execFileSync('fly', ['auth', 'token'], { encoding: 'utf8' }).trim()
  } catch {
    throw new Error(
      'Could not obtain a Fly token: set FLY_API_TOKEN, or install the `fly` CLI and `fly auth login`.',
    )
  }
}

async function queryFly(promBase: string, token: string, query: string): Promise<number | null> {
  try {
    const res = await fetch(`${promBase}/api/v1/query?query=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return extractPromValue(await res.json())
  } catch {
    return null
  }
}

async function queryDbConns(
  sql: postgres.Sql,
): Promise<Pick<MetricsRecord, 'db_total' | 'db_active' | 'db_idle'>> {
  const rows = await sql<{ total: number; active: number; idle: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE state = 'active')::int AS active,
           count(*) FILTER (WHERE state = 'idle')::int   AS idle
    FROM pg_stat_activity WHERE datname = current_database()`
  const r = rows[0] ?? { total: 0, active: 0, idle: 0 }
  return { db_total: r.total, db_active: r.active, db_idle: r.idle }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

if (import.meta.main) {
  const argv = process.argv.slice(2)
  const durationSeconds = parseDurationSeconds(argv)
  const app = requireEnv('FLY_APP') // e.g. statuslines-staging — never prod
  const org = requireEnv('FLY_ORG')
  // Unpooled URL to read the real backends. Derived from DATABASE_URL by default; set
  // DIRECT_DATABASE_URL only to override (e.g. a non-Neon host where the `-pooler` rule doesn't fit).
  const directUrl = process.env.DIRECT_DATABASE_URL ?? toDirectUrl(requireEnv('DATABASE_URL'))
  const sha = process.env.SHA ?? 'local'

  const promBase = `https://api.fly.io/prometheus/${org}`
  const token = flyToken()
  const flyQueries = buildFlyQueries(app)
  const sql = postgres(directUrl, isPooledUrl(directUrl) ? { prepare: false } : {})

  const csvPath = `${RESULTS_DIR}/${sha}-metrics.csv`
  if (!existsSync(csvPath)) writeFileSync(csvPath, `${csvHeader()}\n`)

  console.log(
    `[loadtest capture] app=${app} org=${org} every ${POLL_INTERVAL_MS}ms for ${durationSeconds}s → ${csvPath}`,
  )

  const deadline = Date.now() + durationSeconds * 1000
  let ticks = 0
  while (Date.now() < deadline) {
    const record: MetricsRecord = { ts: new Date().toISOString() }
    const flyValues = await Promise.all(flyQueries.map((q) => queryFly(promBase, token, q.query)))
    flyQueries.forEach((q, i) => {
      record[q.column] = flyValues[i] ?? null
    })
    try {
      Object.assign(record, await queryDbConns(sql))
    } catch {
      // leave db_* blank for this tick
    }
    appendFileSync(csvPath, `${csvRow(record)}\n`)
    ticks++
    await sleep(POLL_INTERVAL_MS)
  }

  await sql.end()
  console.log(`[loadtest capture] done — ${ticks} samples written to ${csvPath}`)
  process.exit(0)
}
