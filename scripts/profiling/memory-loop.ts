import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Workload = 'aborted' | 'assets' | 'gallery' | 'mixed' | 'og'
type ProfileRuntime = 'bun' | 'node'

interface ProbeSample {
  elapsedMs: number
  loopLagMs: number
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  externalMb: number
  arrayBuffersMb: number
}

interface LoadResult {
  durationMs: number
  p95Ms: number
  responseBytes: number
}

type MemoryWaveInput = {
  baselineRssMb: number
  peakRssMb: number
  maxGrowthMb: number
  settledRssMb: number[]
  maxPlateauGrowthMb: number
  retentionGrowthMb: number
}

export function memoryWaveVerdict({
  baselineRssMb,
  peakRssMb,
  settledRssMb,
  maxGrowthMb,
  maxPlateauGrowthMb,
  retentionGrowthMb,
}: MemoryWaveInput): {
  peakGrowthMb: number
  finalPlateauGrowthMb: number
  ongoingRetention: boolean
  passed: boolean
} {
  const peakGrowthMb = peakRssMb - baselineRssMb
  const settledGrowthMb = settledRssMb.map(
    (rss, index) => rss - (settledRssMb[index - 1] ?? baselineRssMb),
  )
  const finalPlateauGrowthMb = (settledRssMb.at(-1) ?? baselineRssMb) - baselineRssMb
  const ongoingRetention = settledGrowthMb.some((growth, index) => {
    const previousGrowth = settledGrowthMb[index - 1]
    return (
      previousGrowth !== undefined &&
      growth >= retentionGrowthMb &&
      previousGrowth >= retentionGrowthMb
    )
  })
  return {
    peakGrowthMb,
    finalPlateauGrowthMb,
    ongoingRetention,
    passed:
      !ongoingRetention &&
      peakGrowthMb <= maxGrowthMb &&
      finalPlateauGrowthMb <= maxPlateauGrowthMb,
  }
}

export function parseProbeSamples(csv: string): ProbeSample[] {
  return csv
    .trim()
    .split('\n')
    .slice(1)
    .flatMap((row) => {
      const values = row.split(',')
      const sample = {
        elapsedMs: Number(values[1]),
        loopLagMs: Number(values[2]),
        rssMb: Number(values[3]),
        heapUsedMb: Number(values[4]),
        heapTotalMb: Number(values[5]),
        externalMb: Number(values[6]),
        arrayBuffersMb: Number(values[7]),
      }
      return Object.values(sample).every(Number.isFinite) ? [sample] : []
    })
}

export const PROFILE_DEFAULTS = {
  requests: 400,
  waves: 3,
  concurrency: 16,
  maxGrowthMb: 120,
  settleMs: 30_000,
  maxPlateauGrowthMb: 20,
  retentionGrowthMb: 30,
} as const
const MINIMUM_PROFILE_RUNTIME_MS = 30 * 60 * 1000
const RESULTS = 'scripts/profiling/results'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function buildProductionApp(): void {
  const result = spawnSync('bun', ['run', 'build'], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('production build failed')
  if (!existsSync('.output/server/index.mjs')) {
    throw new Error('production build missing after bun run build')
  }
}

async function availablePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('could not allocate a profiling port'))
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

function argument(name: string, args: string[] = process.argv): string | undefined {
  const prefix = `--${name}=`
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

export function profileRuntimeArgument(args: string[]): ProfileRuntime {
  const value = argument('runtime', args) ?? 'bun'
  if (value === 'bun' || value === 'node') return value
  throw new Error(`unknown runtime: ${value}`)
}

export function profileServerRuntimeFlags(args: string[]): string[] {
  if (!args.includes('--smol')) return []
  if (profileRuntimeArgument(args) !== 'bun') throw new Error('--smol requires --runtime=bun')
  return ['--smol']
}

function preloadFlag(runtime: ProfileRuntime): '--import' | '--preload' {
  return runtime === 'bun' ? '--preload' : '--import'
}

function positiveNumber(name: string, fallback: number, args: string[] = process.argv): number {
  const raw = argument(name, args)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be positive`)
  return value
}

export function profilePlanArguments(args: string[]): {
  requests: number
  waves: number
  settleMs: number
} {
  return {
    requests: positiveNumber('requests', PROFILE_DEFAULTS.requests, args),
    waves: positiveNumber('waves', PROFILE_DEFAULTS.waves, args),
    settleMs: positiveNumber('settle-ms', PROFILE_DEFAULTS.settleMs, args),
  }
}

export function profileMaximumRuntimeMs({
  waves,
  settleMs,
}: {
  waves: number
  settleMs: number
}): number {
  return Math.max(MINIMUM_PROFILE_RUNTIME_MS, (waves + 1) * settleMs + 300_000)
}

function workloadArgument(): Workload {
  const value = argument('workload') ?? 'mixed'
  if (
    value === 'aborted' ||
    value === 'assets' ||
    value === 'gallery' ||
    value === 'mixed' ||
    value === 'og'
  ) {
    return value
  }
  throw new Error(`unknown workload: ${value}`)
}

async function waitReady(base: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(base)
      if (response.ok) return await response.text()
    } catch {
      // Server is still starting.
    }
    await sleep(100)
  }
  throw new Error(`server never became ready at ${base}`)
}

function assetPaths(html: string): string[] {
  return Array.from(html.matchAll(/(?:href|src)="(\/assets\/[^"?]+)"/g))
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .filter((path, index, paths) => paths.indexOf(path) === index)
}

async function consume(url: string): Promise<number> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return (await response.arrayBuffer()).byteLength
}

async function abortRequest(host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port })
    socket.once('error', reject)
    socket.once('connect', () => {
      socket.write(`GET / HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`)
      setTimeout(() => {
        socket.destroy()
        resolve()
      }, 2)
    })
  })
}

async function runConcurrent(
  requests: number,
  concurrency: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < requests) {
      const index = next
      next += 1
      await task(index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

function readProbeSamples(probePath: string): ProbeSample[] {
  if (!existsSync(probePath)) return []
  return parseProbeSamples(readFileSync(probePath, 'utf8'))
}

function latestSample(samples: ProbeSample[]): ProbeSample {
  const sample = samples.at(-1)
  if (!sample) throw new Error('memory probe produced no samples')
  return sample
}

function peakSample(samples: ProbeSample[]): ProbeSample {
  if (samples.length === 0) throw new Error('memory probe produced no samples during load wave')
  return samples.reduce((peak, sample) => (sample.rssMb > peak.rssMb ? sample : peak))
}

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

async function runLoad(
  base: string,
  host: string,
  port: number,
  workload: Workload,
  paths: string[],
  requests: number,
  concurrency: number,
): Promise<LoadResult> {
  const latencies: number[] = []
  let responseBytes = 0
  const startedAt = performance.now()
  await runConcurrent(requests, concurrency, async (index) => {
    const requestStartedAt = performance.now()
    const bytes =
      workload === 'aborted'
        ? await abortRequest(host, port).then(() => 0)
        : workload === 'og'
          ? await consume(`${base}/og/home.png`)
          : await consume(`${base}${paths[index % paths.length]}`)
    latencies.push(performance.now() - requestStartedAt)
    if (responseBytes === 0) responseBytes = bytes
  })
  return {
    durationMs: Math.round(performance.now() - startedAt),
    p95Ms: Math.round(percentile95(latencies)),
    responseBytes,
  }
}

interface ProfileWorkloadInput {
  base: string
  host: string
  port: number
  workload: Workload
  requestedPath: string
  requests: number
  waves: number
  concurrency: number
  settleMs: number
  probePath: string
  maxGrowthMb: number
  maxPlateauGrowthMb: number
  retentionGrowthMb: number
  runtime: ProfileRuntime
  runtimeMode: 'default' | 'smol'
}

async function profileWorkload(input: ProfileWorkloadInput): Promise<boolean> {
  const readinessUrl =
    input.workload === 'assets' || input.workload === 'mixed'
      ? input.base
      : `${input.base}${input.requestedPath}`
  const html = await waitReady(readinessUrl)
  const assets = assetPaths(html)
  if ((input.workload === 'assets' || input.workload === 'mixed') && assets.length === 0) {
    throw new Error('gallery HTML contained no build assets')
  }
  const paths =
    input.workload === 'gallery'
      ? [input.requestedPath]
      : input.workload === 'assets'
        ? assets
        : ['/', ...assets]
  const warmup = await runLoad(
    input.base,
    input.host,
    input.port,
    input.workload,
    paths,
    input.requests,
    input.concurrency,
  )
  await sleep(input.settleMs)
  let samples = readProbeSamples(input.probePath)
  const baseline = latestSample(samples)
  console.log(
    `[memory-loop] warmup requests=${input.requests} duration_ms=${warmup.durationMs} p95_ms=${warmup.p95Ms} response_bytes=${warmup.responseBytes} settled_rss_mb=${baseline.rssMb} settled_heap_used_mb=${baseline.heapUsedMb} settled_external_mb=${baseline.externalMb} settled_array_buffers_mb=${baseline.arrayBuffersMb}`,
  )

  const settledRssMb: number[] = []
  const wavePeaks: ProbeSample[] = []
  for (let wave = 1; wave <= input.waves; wave++) {
    const sampleOffset = samples.length
    const load = await runLoad(
      input.base,
      input.host,
      input.port,
      input.workload,
      paths,
      input.requests,
      input.concurrency,
    )
    await sleep(input.settleMs)
    samples = readProbeSamples(input.probePath)
    const waveSamples = samples.slice(sampleOffset)
    const peak = peakSample(waveSamples)
    const settled = latestSample(waveSamples)
    wavePeaks.push(peak)
    settledRssMb.push(settled.rssMb)
    console.log(
      `[memory-loop] wave=${wave} requests=${input.requests} duration_ms=${load.durationMs} p95_ms=${load.p95Ms} response_bytes=${load.responseBytes} peak_rss_mb=${peak.rssMb} settled_rss_mb=${settled.rssMb} settled_heap_used_mb=${settled.heapUsedMb} settled_heap_total_mb=${settled.heapTotalMb} settled_external_mb=${settled.externalMb} settled_array_buffers_mb=${settled.arrayBuffersMb}`,
    )
  }

  const observedPeakRssMb = Math.max(...wavePeaks.map((sample) => sample.rssMb))
  const verdict = memoryWaveVerdict({
    baselineRssMb: baseline.rssMb,
    peakRssMb: observedPeakRssMb,
    settledRssMb,
    maxGrowthMb: input.maxGrowthMb,
    maxPlateauGrowthMb: input.maxPlateauGrowthMb,
    retentionGrowthMb: input.retentionGrowthMb,
  })
  console.log(
    `[memory-loop] runtime=${input.runtime} runtime_mode=${input.runtimeMode} workload=${input.workload} path=${input.requestedPath} waves=${input.waves} requests_per_wave=${input.requests} baseline_rss_mb=${baseline.rssMb} peak_rss_mb=${observedPeakRssMb} peak_growth_mb=${verdict.peakGrowthMb} final_plateau_growth_mb=${verdict.finalPlateauGrowthMb} ongoing_retention=${verdict.ongoingRetention} budget_mb=${input.maxGrowthMb} plateau_budget_mb=${input.maxPlateauGrowthMb} verdict=${verdict.passed ? 'PASS' : 'FAIL'}`,
  )
  return verdict.passed
}

async function main(): Promise<void> {
  const runtime = profileRuntimeArgument(process.argv)
  buildProductionApp()
  const host = process.env.PROFILE_MEMORY_HOST
  if (!host) throw new Error('PROFILE_MEMORY_HOST is required')
  const port = await availablePort(host)
  const workload = workloadArgument()
  const { requests, waves, settleMs } = profilePlanArguments(process.argv)
  const concurrency = positiveNumber('concurrency', PROFILE_DEFAULTS.concurrency)
  const maxGrowthMb = positiveNumber('max-growth-mb', PROFILE_DEFAULTS.maxGrowthMb)
  const maxPlateauGrowthMb = positiveNumber(
    'max-plateau-growth-mb',
    PROFILE_DEFAULTS.maxPlateauGrowthMb,
  )
  const retentionGrowthMb = positiveNumber(
    'retention-growth-mb',
    PROFILE_DEFAULTS.retentionGrowthMb,
  )
  const requestedPath = argument('path') ?? '/'
  const heapProfile = process.argv.includes('--heap-profile')
  if (!requestedPath.startsWith('/')) throw new Error('--path must start with /')
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'statuslines-memory-loop-'))
  const probePath = join(temporaryDirectory, 'probe.csv')
  const env = { ...process.env }
  env.HOST = host
  env.NODE_ENV = 'production'
  env.PORT = String(port)
  env.PROFILE_MAX_MS = String(profileMaximumRuntimeMs({ waves, settleMs }))
  env.PROFILE_PROBE_OUT = probePath

  const profileName = `${new Date().toISOString().replace(/[:.]/g, '-')}.${runtime}.${workload}.heapsnapshot`
  const runtimeFlags = profileServerRuntimeFlags(process.argv)
  const serverArgs = [
    ...runtimeFlags,
    ...(heapProfile
      ? ['--heap-prof', '--heap-prof-dir', RESULTS, '--heap-prof-name', profileName]
      : []),
    preloadFlag(runtime),
    './scripts/profiling/probe.ts',
    '.output/server/index.mjs',
  ]
  const server = spawn(runtime, serverArgs, { env, stdio: 'inherit' })
  if (server.pid === undefined) throw new Error('profile server did not start')
  const base = `http://${host}:${port}`

  try {
    const passed = await profileWorkload({
      base,
      host,
      port,
      workload,
      requestedPath,
      requests,
      waves,
      concurrency,
      settleMs,
      probePath,
      maxGrowthMb,
      maxPlateauGrowthMb,
      retentionGrowthMb,
      runtime,
      runtimeMode: runtimeFlags.includes('--smol') ? 'smol' : 'default',
    })
    if (!passed) process.exitCode = 1
  } finally {
    server.kill('SIGUSR2')
    await Promise.race([
      new Promise<void>((resolve) => server.once('exit', () => resolve())),
      sleep(5000).then(() => server.kill('SIGKILL')),
    ])
    if (heapProfile) console.log(`[memory-loop] heap_profile=${RESULTS}/${profileName}`)
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
