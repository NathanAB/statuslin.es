/**
 * SPIKE (throwaway, never merged): snapshot a hardened Desktop sandbox with Desktop already booted
 * at the Code home, so each mod run resumes past Xvfb, Electron start, the welcome screen and the
 * engine install. No mod code has run in it. The plugin and config dirs Desktop passes to its engine
 * are fixed paths, filled per run after resume.
 *
 *   bun scripts/spikes/warm-desktop-snapshot.ts <hardened-snapshot-id> [--dark]
 */
import { mkdirSync } from 'node:fs'
import { Sandbox } from 'e2b'
import { SANDBOX_CANNED_MODEL_SERVER_DEST } from '@/render/e2b-template'
import { bootDesktop, Run } from './desktop-real'
import { stagingE2bKey } from './e2b-shell'

async function main() {
  const [from] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!from) throw new Error('hardened snapshot id required')
  const dark = process.argv.includes('--dark')
  const apiKey = stagingE2bKey()
  mkdirSync('docs/research/desktop-real', { recursive: true })
  const started = performance.now()
  const sandbox = await Sandbox.create(from, {
    apiKey,
    allowInternetAccess: false,
    timeoutMs: 10 * 60_000,
    secure: true,
  })
  try {
    const run = new Run(sandbox, `warm${dark ? '-dark' : ''}`)
    // Desktop checks the gateway while it boots; a dead port leaves a "Can't reach" banner in every session.
    await run.sh(
      `echo '{"text":"warm","usage":{"input_tokens":1,"output_tokens":1}}' > /tmp/warm-reply.json && (nohup python3 ${SANDBOX_CANNED_MODEL_SERVER_DEST} --listen 127.0.0.1 --port 8787 --canned-reply /tmp/warm-reply.json >/tmp/warm-model.log 2>&1 &) && sleep 0.5`,
    )
    await bootDesktop(run, { noSandbox: true, dark })
    await new Promise((r) => setTimeout(r, 3000))
    await run.shot('home')
    await run.sh('pkill -f warm-reply.json; sleep 0.3; ! pgrep -f warm-reply.json')
    const { snapshotId } = await sandbox.createSnapshot({ apiKey })
    console.log(
      `warm snapshot${dark ? ' (dark)' : ''}: ${snapshotId} in ${Math.round(performance.now() - started)} ms`,
    )
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
