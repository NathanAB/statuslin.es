import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RUNS = join(import.meta.dirname, 'results', 'runs')
/** The welcome banner's mascot glyphs and the product and company names. */
const BRANDING = /▐▛|▜▌|▝▜|▛███|Claude Code|Anthropic|claude\.com|API Usage Billing/

type Note = { notes?: string[] }
type Run = {
  mod: string
  name: string
  pluginName?: string | null
  sha: string
  run: number
  rendered: boolean
  error?: string
  cropHash?: string
  keptRows?: number[]
  plain?: string[]
  steps?: unknown[]
  timings?: Record<string, number>
  claudeRssKb?: number | null
  timedOutPhases?: string[]
  unansweredSessionCalls?: { event: string }[]
  validate?: { exitCode: number; json?: { success?: boolean; contents?: Note[] } } | null
}

/** Splits a validate note list on commas that sit outside `{...}` matchers and `(...)` asides. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of list) {
    if (ch === '{' || ch === '(') depth++
    if (ch === '}' || ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** `ModFootprint` as it would be derived from the validate report's per-module notes. */
export function footprint(contents: Note[] = []) {
  const events = new Set<string>()
  const calls = new Set<string>()
  for (const note of contents.flatMap((c) => c.notes ?? [])) {
    const hooks = note.match(/ hooks: (.*)$/)
    const called = note.match(/ calls: (.*)$/)
    for (const h of hooks ? splitTopLevel(hooks[1] as string) : []) events.add(h)
    for (const c of called ? splitTopLevel(called[1] as string) : []) {
      calls.add(c.replace(/\s*\(.*\)$/, ''))
    }
  }
  return { events: [...events].sort(), calls: [...calls].sort() }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN

const runs = readdirSync(RUNS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(RUNS, f), 'utf8')) as Run)
const byMod = new Map<string, Run[]>()
for (const r of runs) byMod.set(r.mod, [...(byMod.get(r.mod) ?? []), r])

const out = (line = '') => process.stdout.write(`${line}\n`)
out(
  '| mod | plugin | runs | rendered | distinct crops | total ms median (range) | ready ms median | RSS MB | unanswered `$.session` | steps |',
)
out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const [mod, rs] of [...byMod].sort()) {
  const ok = rs.filter((r) => !r.error)
  const totals = ok.map((r) => r.timings?.total ?? NaN)
  const unanswered = [
    ...new Set(ok.flatMap((r) => r.unansweredSessionCalls ?? []).map((c) => c.event)),
  ]
  out(
    `| ${mod} | ${ok[0]?.pluginName ?? rs[0]?.name} | ${rs.length} | ${rs.filter((r) => r.rendered).length} | ${new Set(ok.map((r) => r.cropHash)).size} | ${totals.length ? `${median(totals)} (${Math.min(...totals)}-${Math.max(...totals)})` : 'n/a'} | ${median(ok.map((r) => r.timings?.claudeReady ?? NaN))} | ${Math.round(median(ok.map((r) => r.claudeRssKb ?? NaN)) / 1024)} | ${unanswered.join(', ') || 'none'} | ${JSON.stringify(rs[0]?.steps ?? [])} |`,
  )
}

if (process.argv.includes('--details')) {
  for (const [mod, rs] of [...byMod].sort()) {
    const first = rs.find((r) => !r.error) ?? rs[0]
    if (!first) continue
    out(`\n### ${mod} @ ${first.sha}`)
    if (first.error) out(`error: ${first.error}`)
    const fp = footprint(first.validate?.json?.contents)
    out(`validate: exit ${first.validate?.exitCode} success=${first.validate?.json?.success}`)
    out(`footprint: ${JSON.stringify(fp)}`)
    const branded = rs.flatMap((r) => (r.plain ?? []).filter((line) => BRANDING.test(line)))
    out(`branding in kept rows: ${branded.length ? JSON.stringify([...new Set(branded)]) : 'none'}`)
    const timeouts = [...new Set(rs.flatMap((r) => r.timedOutPhases ?? []))]
    if (timeouts.length) out(`quiet-wait timeouts: ${timeouts.join(', ')}`)
    out('```')
    for (const line of first.plain ?? []) out(line.trimEnd())
    out('```')
  }
}
