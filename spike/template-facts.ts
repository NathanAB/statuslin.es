import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Sandbox } from 'e2b'
import { E2B_TEMPLATE_ID } from '@/render/e2b-template'
import { e2bApiKey } from './env'
import { SPIKE_TEMPLATE, SPIKE_TEMPLATE_ALIAS } from './template'

const SAMPLES = 9
const out = (line: string) => process.stdout.write(`${line}\n`)
const apiKey = e2bApiKey()

type TemplateRow = {
  templateID: string
  names?: string[]
  aliases?: string[]
  public: boolean
  diskSizeMB?: number
  memoryMB: number
  cpuCount: number
  envdVersion?: string
}

/** The team's template list from the E2B API: the `public` flag is the privacy answer. */
async function templateRows(): Promise<TemplateRow[]> {
  const res = await fetch('https://api.e2b.app/templates', { headers: { 'X-API-Key': apiKey } })
  if (!res.ok) throw new Error(`GET /templates: HTTP ${res.status}`)
  return (await res.json()) as TemplateRow[]
}

const FACTS_CMD = [
  `df -m / | tail -1 | awk '{print "rootfs_used_mb=" $3}'`,
  `du -sm /usr/local/lib/node_modules/@anthropic-ai /opt/statuslines/replay 2>/dev/null | awk '{print "du_mb " $2 "=" $1}'`,
  'command -v claude >/dev/null && { s=$(date +%s%N); claude --version >/dev/null; e=$(date +%s%N); echo "claude_version_cold_ms=$(( (e-s)/1000000 ))"; s=$(date +%s%N); claude --version >/dev/null; e=$(date +%s%N); echo "claude_version_warm_ms=$(( (e-s)/1000000 ))"; } || echo claude=absent',
  'node --version',
  'uname -srm',
  'nproc',
  `free -m | awk '/Mem:/{print "mem_total_mb=" $2}'`,
].join('; ')

/** Create to first finished command: the start-up a render pays before its own work. */
async function sample(template: string, withFacts: boolean) {
  const t = performance.now()
  const sandbox = await Sandbox.create(template, {
    apiKey,
    allowInternetAccess: false,
    timeoutMs: 120_000,
  })
  try {
    await sandbox.commands.run('true', { timeoutMs: 30_000 })
    const startMs = Math.round(performance.now() - t)
    if (!withFacts) return { startMs, facts: '' }
    const facts = await sandbox.commands.run(FACTS_CMD, {
      timeoutMs: 120_000,
      // biome-ignore lint/style/useNamingConvention: env var name.
      envs: { HOME: '/tmp/facts-home' },
    })
    return { startMs, facts: facts.stdout }
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

/** Alternates the templates so drift and warm-up hit every side alike. */
async function measureAll(templates: string[]) {
  const results = templates.map((template) => ({ template, startMs: [] as number[], facts: '' }))
  for (let i = 0; i < SAMPLES; i++) {
    for (const r of results) {
      const s = await sample(r.template, i === 0)
      r.startMs.push(s.startMs)
      if (i === 0) r.facts = s.facts
    }
  }
  return results.map((r) => {
    const sorted = [...r.startMs].sort((a, b) => a - b)
    return { ...r, medianStartMs: sorted[Math.floor(SAMPLES / 2)] }
  })
}

const rows = await templateRows()
const privacy = rows
  .filter((r) =>
    [...(r.names ?? []), ...(r.aliases ?? [])].some((n) =>
      [SPIKE_TEMPLATE_ALIAS, 'statuslines-render-build'].some((alias) => n.includes(alias)),
    ),
  )
  .map((r) => ({
    names: r.names ?? r.aliases,
    templateID: r.templateID,
    public: r.public,
    diskSizeMB: r.diskSizeMB,
    memoryMB: r.memoryMB,
    cpuCount: r.cpuCount,
  }))
out(JSON.stringify(privacy, null, 2))

const measured = await measureAll([SPIKE_TEMPLATE, E2B_TEMPLATE_ID])
for (const m of measured) {
  out(
    `${m.template}: create-to-first-command ms ${m.startMs.join(', ')} (median ${m.medianStartMs})\n${m.facts}`,
  )
}
writeFileSync(
  join(import.meta.dirname, 'results', 'template-facts.json'),
  `${JSON.stringify({ measuredAt: new Date().toISOString(), privacy, measured }, null, 2)}\n`,
)
