import { writeFileSync } from 'node:fs'
import { e2bApiKey } from './env'
import { ensureSpikeTemplate } from './template'

const log = (line: string) => process.stdout.write(`${line}\n`)
const record = await ensureSpikeTemplate(e2bApiKey(), log, process.argv.includes('--force'))
if (record) {
  writeFileSync(
    `${import.meta.dirname}/results/template-build.json`,
    `${JSON.stringify({ ...record, builtAt: new Date().toISOString() }, null, 2)}\n`,
  )
  log(`built ${record.template} in ${record.buildMs} ms (build ${record.buildId})`)
} else {
  log('spike template already built; pass --force to rebuild')
}
