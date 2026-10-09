import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type CaptureResult, capture } from './capture'
import { crop } from './crop'
import { e2bApiKey } from './env'
import { modTarball } from './fetch-mod'
import { findMods, MODS, type ModSource, modKey } from './mods'
import { ensureSpikeTemplate } from './template'

const USAGE = `usage:
  bun spike/run.ts <mod name | owner/repo/path> [--runs N]
  bun spike/run.ts --all [--concurrency N]   candidates x3, every other mod x1
  bun spike/run.ts --baseline`

const RESULTS = join(import.meta.dirname, 'results')
const RUNS = join(RESULTS, 'runs')
const out = (line = '') => process.stdout.write(`${line}\n`)

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

const slug = (m: ModSource) => modKey(m).replaceAll('/', '__')
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12)

function parseValidate(v: CaptureResult['validate']) {
  if (!v) return null
  try {
    return { exitCode: v.exitCode, json: JSON.parse(v.stdout) as unknown }
  } catch {
    return {
      exitCode: v.exitCode,
      stdout: v.stdout.slice(0, 2000),
      stderr: v.stderr.slice(0, 2000),
    }
  }
}

async function runMod(apiKey: string, mod: ModSource, run: number, baseline: CaptureResult) {
  const started = performance.now()
  try {
    const result = await capture(apiKey, { source: mod, tarball: await modTarball(mod) })
    const c = crop(baseline.screen.screen, result.screen.screen)
    const record = {
      mod: modKey(mod),
      name: mod.name,
      sha: mod.sha,
      run,
      steps: mod.steps,
      rendered: c.segments.length > 0,
      cropHash: hash(c.comparableKey),
      keptRows: c.keptRows,
      promptRow: c.promptRow,
      positionalDiffRows: c.positionalDiffRows,
      plain: c.plain,
      segments: c.segments,
      timings: result.timings,
      claudeRssKb: result.claudeRssKb,
      sandboxMemUsedMb: result.sandboxMemUsedMb,
      timedOutPhases: result.timedOutPhases,
      calls: result.calls,
      pluginName: result.pluginName,
      unansweredSessionCalls: result.calls.filter(
        (x) => x.plugin === result.pluginName && !x.answered && x.event.startsWith('session.'),
      ),
      requestLog: result.requestLog,
      validate: parseValidate(result.validate),
      rawBytes: result.rawBytes,
      screenPlain: result.screen.screen.map((r) => r.plain),
    }
    writeFileSync(join(RUNS, `${slug(mod)}-${run}.json`), `${JSON.stringify(record, null, 1)}\n`)
    return record
  } catch (error) {
    const record = {
      mod: modKey(mod),
      name: mod.name,
      sha: mod.sha,
      run,
      rendered: false,
      error: String(error).slice(0, 2000),
      wallMs: Math.round(performance.now() - started),
    }
    writeFileSync(join(RUNS, `${slug(mod)}-${run}.json`), `${JSON.stringify(record, null, 1)}\n`)
    return record
  }
}

async function recordBaseline(apiKey: string): Promise<CaptureResult> {
  const baseline = await capture(apiKey)
  writeFileSync(
    join(RESULTS, 'baseline.json'),
    `${JSON.stringify(
      {
        timings: baseline.timings,
        claudeRssKb: baseline.claudeRssKb,
        sandboxMemUsedMb: baseline.sandboxMemUsedMb,
        timedOutPhases: baseline.timedOutPhases,
        calls: baseline.calls,
        requestLog: baseline.requestLog,
        feedValidate: parseValidate(baseline.validate),
        promptRowFound: baseline.screen.screen.some((r) => /[❯>]/.test(r.plain)),
        screenPlain: baseline.screen.screen.map((r) => r.plain),
        screenAnsi: baseline.screen.screen.map((r) => r.ansi),
      },
      null,
      1,
    )}\n`,
  )
  return baseline
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
    }),
  )
}

type RunRecord = Awaited<ReturnType<typeof runMod>>

function printRecord(r: RunRecord) {
  if ('error' in r) {
    out(`${r.mod} run ${r.run}: ERROR ${r.error.split('\n')[0]}`)
    return
  }
  out(
    `${r.mod} run ${r.run}: ${r.rendered ? 'rendered' : 'EMPTY CROP'} rows=${r.keptRows.join(',')} crop=${r.cropHash} total=${r.timings.total}ms ready=${r.timings.claudeReady}ms rss=${r.claudeRssKb}KB${r.timedOutPhases.length ? ` timeouts=${r.timedOutPhases.join(',')}` : ''}`,
  )
  if (r.unansweredSessionCalls.length) {
    out(`  unanswered: ${r.unansweredSessionCalls.map((c) => c.event).join(', ')}`)
  }
}

async function main() {
  const apiKey = e2bApiKey()
  mkdirSync(RUNS, { recursive: true })
  const built = await ensureSpikeTemplate(apiKey, out)
  if (built) {
    writeFileSync(join(RESULTS, 'template-build.json'), `${JSON.stringify(built, null, 2)}\n`)
  }

  if (process.argv.includes('--baseline')) {
    const b = await recordBaseline(apiKey)
    out(b.screen.screen.map((r) => r.ansi).join('\n'))
    out(`baseline timings ${JSON.stringify(b.timings)} rss=${b.claudeRssKb}KB`)
    return
  }

  const all = process.argv.includes('--all')
  const query = process.argv[2]
  const targets = all ? MODS : query && !query.startsWith('--') ? findMods(query) : []
  if (targets.length === 0) {
    out(USAGE)
    process.exit(2)
  }
  const runsFlag = flag('--runs')
  const jobs = targets.flatMap((mod) => {
    const runs = runsFlag ? Number(runsFlag) : all && mod.isCandidate ? 3 : 1
    return Array.from({ length: runs }, (_, i) => ({ mod, run: i + 1 }))
  })

  const baseline = await recordBaseline(apiKey)
  out(
    `baseline recorded: ready=${baseline.timings.claudeReady}ms total=${baseline.timings.total}ms`,
  )
  const records: RunRecord[] = []
  await pool(jobs, Number(flag('--concurrency') ?? 4), async ({ mod, run }) => {
    const r = await runMod(apiKey, mod, run, baseline)
    records.push(r)
    printRecord(r)
  })

  Bun.spawnSync(['bunx', 'biome', 'format', '--write', RESULTS])
  if (!all && records.length) {
    const last = records.find((r) => !('error' in r))
    if (last && !('error' in last)) {
      out('\ncropped preview:')
      out(last.plain.join('\n'))
      out('\nAnsiSegment[]:')
      out(JSON.stringify(last.segments))
    }
  }
}

await main()
