import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { db } from '@/db'
import { E2BSandboxRunner } from '@/render/e2b-runner'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { renderConfig } from '@/render/pipeline'
import { storePreviews } from '@/render/store'
import { INTERPRETERS, type Interpreter, type SandboxRunner } from '@/render/types'

const [file, interpreter = 'bash'] = process.argv.slice(2)
if (!file) {
  console.error('usage: bun run render <script-file> [bash|node|python]')
  process.exit(1)
}
if (!(INTERPRETERS as readonly string[]).includes(interpreter)) {
  console.error(
    'usage: bun run render <script-file> [bash|node|python] — interpreter must be bash|node|python',
  )
  process.exit(1)
}

const script = readFileSync(file, 'utf8')
const scriptSha = createHash('sha256').update(script).digest('hex')

// Real sandbox when a key is present; fake runner otherwise.
const runner: SandboxRunner = process.env.E2B_API_KEY
  ? new E2BSandboxRunner()
  : new FakeSandboxRunner()

const previews = await renderConfig({ script, interpreter: interpreter as Interpreter }, runner)
await storePreviews(db, scriptSha, previews)
console.log(`Rendered ${previews.length} previews for ${scriptSha.slice(0, 12)}…`)
for (const p of previews) {
  console.log(
    `  ${p.scenarioKey}: exit=${p.exitCode} timedOut=${p.timedOut} ` +
      `net=${p.trace.networkAttempts.length} reads=${p.trace.sensitiveReads.length}`,
  )
}
process.exit(0)
