import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { type DrawLocation, describeFootprint } from '@/mods/footprint'
import { createGitHub } from '@/mods/github'
import { inspectPlugin } from '@/mods/plugin-facts'
import { terminalLine } from '@/mods/terminal-line'
import { E2B_DESKTOP_SANDBOXES } from '@/render/mods/desktop/desktop-sandbox'
import { desktopRecorder } from '@/render/mods/desktop/recorder'
import type { DesktopRecording } from '@/render/mods/desktop/types'
import { withModSandbox } from '@/render/mods/mod-sandbox'

/**
 * Desktop-upgrade smoke test: records the no-mod baseline and the given curated mods (default: all)
 * in the real Claude Desktop with the production recorder, and writes every PNG to <out-dir>. No
 * database: each mod's draw locations come from `claude plugin validate` in a mods sandbox, as the
 * import reads them. Look at the PNGs: the clicks in src/render/mods/desktop/screen.ts must still
 * land and the crops must still frame each mod.
 *
 * AGENT USAGE (needs E2B_API_KEY):
 *
 *   bun run smoke:desktop <out-dir> [plugin-name...]
 *
 * Exit code 0 when every mod recorded (a shot or nothing), 1 when any failed.
 */

const CONCURRENCY = 4

interface Outcome {
  mod: string
  draws: DrawLocation[]
  ms: number
  result: string
}

async function forEachConcurrently<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

function describe(recording: DesktopRecording): string {
  if (recording.kind === 'nothing') return 'nothing'
  return `shot ${recording.width}x${recording.height} css, anchor ${recording.cardAnchor}`
}

async function main(): Promise<number> {
  const [outArg, ...names] = process.argv.slice(2)
  if (!outArg) throw new Error('usage: bun run smoke:desktop <out-dir> [plugin-name...]')
  const outDir = resolve(outArg)
  mkdirSync(outDir, { recursive: true })
  const curation = parseCuration(JSON.parse(readFileSync(CURATION_FILE, 'utf8')))
  if (!curation.ok) throw new Error(`${CURATION_FILE} is invalid`)
  const unknown = names.filter((n) => !curation.entries.some((e) => e.pluginName === n))
  if (unknown.length > 0) throw new Error(`not curated: ${unknown.join(', ')}`)
  const entries = curation.entries.filter((e) => names.length === 0 || names.includes(e.pluginName))

  const github = createGitHub()
  const recorder = desktopRecorder(E2B_DESKTOP_SANDBOXES)
  const started = performance.now()
  const baseline = recorder.baseline()
  baseline.catch(() => {})
  const outcomes: Outcome[] = []
  const record = async (entry: CurationEntry) => {
    const at = performance.now()
    const outcome: Outcome = { mod: entry.pluginName, draws: [], ms: 0, result: '' }
    try {
      const source = {
        tarball: await github.tarball(entry.repoUrl, entry.commitSha),
        path: entry.path,
      }
      const facts = await withModSandbox(source, inspectPlugin)
      outcome.draws = describeFootprint(facts.footprint).draws
      const recording = await recorder.record({
        mod: { source, pluginName: entry.pluginName },
        inputSteps: entry.inputSteps,
        draws: outcome.draws,
      })
      if (recording.kind === 'shot')
        writeFileSync(join(outDir, `${entry.pluginName}.png`), recording.png)
      outcome.result = `${describe(recording)}, Desktop ${recording.desktopVersion}, engine ${recording.engineVersion}`
    } catch (error) {
      outcome.result = `FAILED: ${error instanceof Error ? error.message : String(error)}`
    }
    outcome.ms = Math.round(performance.now() - at)
    outcomes.push(outcome)
    console.log(
      terminalLine(
        `${outcome.mod}: ${outcome.result} [draws ${outcome.draws.join(', ') || 'none'}] ${outcome.ms} ms`,
      ),
    )
  }
  await forEachConcurrently(entries, CONCURRENCY, record)
  try {
    const { png, desktopVersion, engineVersion } = await baseline
    writeFileSync(join(outDir, 'baseline.png'), png)
    console.log(terminalLine(`baseline: Desktop ${desktopVersion}, engine ${engineVersion}`))
  } catch (error) {
    console.log(terminalLine(`baseline FAILED: ${error instanceof Error ? error.message : error}`))
    return 1
  }
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(outcomes, null, 2))
  console.log(
    `${outcomes.length} mods in ${Math.round((performance.now() - started) / 1000)} s; PNGs in ${outDir}`,
  )
  return outcomes.some((o) => o.result.startsWith('FAILED')) ? 1 : 0
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(
        terminalLine(`[smoke:desktop] ${error instanceof Error ? error.message : error}`),
      )
      process.exit(1)
    },
  )
}
