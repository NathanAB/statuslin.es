import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { loadtestSlug, seedLoadConfigs } from '../loadtest/seed'
import { teardownLoadConfigs } from '../loadtest/teardown'

/**
 * Live profiler for the hot read paths. Builds the prod server, runs it under Bun's CPU + heap
 * profilers with the event-loop/RSS probe preloaded, drives it with concurrent local load, then
 * stops it (Bun flushes the profiles on exit). Captures: CPU flamegraph (markdown), heap snapshot,
 * event-loop lag + RSS time series, request count, and response payload sizes.
 *
 * Run: `bun run profile:server` (bun auto-loads .env for DATABASE_URL). Seeds + tears down its own
 * loadtest data. Writes artifacts to scripts/profiling/results/. Touches NO production code — Bun's
 * profiler flags and the preload probe are attached here at launch, never in the Dockerfile/fly CMD.
 *
 * Numbers are local (my machine, not the shared-cpu-1x), so read the CPU breakdown by *proportion*,
 * not absolute ms; the DB round-trips here also include my network distance to Neon (see bench).
 */

type Db = Parameters<typeof seedLoadConfigs>[0]

const PORT = 3210
const HOST = '127.0.0.1'
const SEED_COUNT = 50
const LOAD_SECONDS = 25
const CONCURRENCY = 16
const RESULTS = 'scripts/profiling/results'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitReady(base: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base)
      if (r.ok) {
        await r.text()
        return
      }
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error(`server never became ready at ${base}`)
}

async function bytesOf(url: string): Promise<number> {
  const r = await fetch(url)
  return (await r.arrayBuffer()).byteLength
}

async function generateLoad(base: string, slugs: string[]): Promise<{ reqs: number }> {
  const deadline = Date.now() + LOAD_SECONDS * 1000
  let reqs = 0
  const worker = async () => {
    while (Date.now() < deadline) {
      await fetch(base).then((r) => r.text())
      const slug = slugs[Math.floor(Math.random() * slugs.length)] ?? slugs[0]
      await fetch(`${base}/c/${slug}`).then((r) => r.text())
      reqs += 2
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  return { reqs }
}

function summarizeProbe(csvPath: string): string {
  if (!existsSync(csvPath)) return 'probe: (no samples)'
  const rows = readFileSync(csvPath, 'utf8').trim().split('\n').slice(1)
  let peakRss = 0
  let maxLag = 0
  for (const row of rows) {
    const [, , lag, rss] = row.split(',')
    peakRss = Math.max(peakRss, Number(rss))
    maxLag = Math.max(maxLag, Number(lag))
  }
  return `probe: ${rows.length} samples · peak RSS ${peakRss} MB · max event-loop lag ${maxLag.toFixed(1)} ms`
}

async function main(): Promise<void> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db

  console.log(`[profile:server] seeding ${SEED_COUNT} loadtest configs…`)
  await seedLoadConfigs(db, { count: SEED_COUNT })
  const slugs = Array.from({ length: SEED_COUNT }, (_, i) => loadtestSlug(i + 1))

  console.log('[profile:server] building prod server (bun run build)…')
  if (spawnSync('bun', ['run', 'build'], { stdio: 'inherit' }).status !== 0) {
    throw new Error('build failed')
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const probeOut = `${RESULTS}/${ts}-probe.csv`
  // Env var names are conventionally uppercase; assign onto a copy (member assignment isn't
  // flagged by useNamingConvention, unlike uppercase object-literal keys).
  const env = { ...process.env }
  env.PORT = String(PORT)
  env.HOST = HOST
  env.PROFILE_PROBE_OUT = probeOut
  env.PROFILE_MAX_MS = String((LOAD_SECONDS + 30) * 1000)
  const args = [
    '--cpu-prof',
    '--cpu-prof-md',
    '--cpu-prof-dir',
    RESULTS,
    '--cpu-prof-name',
    `${ts}.cpuprofile`,
    '--heap-prof',
    '--heap-prof-dir',
    RESULTS,
    '--heap-prof-name',
    `${ts}.heapsnapshot`,
    '--preload',
    'scripts/profiling/probe.ts',
    '.output/server/index.mjs',
  ]
  console.log('[profile:server] starting server under CPU + heap profiler…')
  const server = spawn('bun', args, { env, stdio: 'inherit' })
  const base = `http://${HOST}:${PORT}`

  try {
    await waitReady(base)
    const gallery = await bytesOf(base)
    const detail = await bytesOf(`${base}/c/${slugs[0]}`)
    console.log(`[profile:server] warm. payloads: gallery=${gallery}B detail=${detail}B`)
    console.log(`[profile:server] driving ${LOAD_SECONDS}s of load (${CONCURRENCY} workers)…`)
    const { reqs } = await generateLoad(base, slugs)
    console.log(`[profile:server] sent ${reqs} requests`)
  } finally {
    // SIGUSR2 → the preload probe calls process.exit(0), a CLEAN exit that flushes Bun's profiles.
    // SIGINT/SIGTERM do NOT flush and the nitro server ignores them, so a forced kill is the last
    // resort (no profile, but no orphan).
    console.log('[profile:server] stopping server (SIGUSR2 → clean exit flushes profiles)…')
    server.kill('SIGUSR2')
    const exited = await new Promise<boolean>((resolve) => {
      server.on('exit', () => resolve(true))
      setTimeout(() => resolve(false), 15000)
    })
    if (!exited) {
      console.warn('[profile:server] server ignored SIGUSR2 — SIGKILL (profiles not flushed)')
      server.kill('SIGKILL')
    }
    await teardownLoadConfigs(db)
    await client.end()
  }

  const artifacts = readdirSync(RESULTS).filter((f) => f.startsWith(ts))
  console.log(`\n${summarizeProbe(probeOut)}`)
  console.log(`[profile:server] artifacts in ${RESULTS}/:`)
  for (const f of artifacts) console.log(`  - ${f}`)
  console.log('Read the *.cpuprofile.md flamegraph to see where render CPU goes.')
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
