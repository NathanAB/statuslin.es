/**
 * SPIKE (throwaway, never merged): drive one E2B sandbox from the shell for the real-Desktop spike.
 * Output from the sandbox is hostile: text is capped before printing, PNGs are size- and
 * signature-checked before saving, and nothing that comes back is executed.
 *
 *   bun scripts/spikes/e2b-shell.ts create [--template base] [--internet] [--minutes 30]
 *   bun scripts/spikes/e2b-shell.ts run <id> [--root] [--timeout 120] -- <command>
 *   bun scripts/spikes/e2b-shell.ts bg <id> [--root] -- <command>
 *   bun scripts/spikes/e2b-shell.ts put <id> <local> <remote>
 *   bun scripts/spikes/e2b-shell.ts shot <id> <local.png> [--display :99]
 *   bun scripts/spikes/e2b-shell.ts getpng <id> <remote.png> <local.png>
 *   bun scripts/spikes/e2b-shell.ts kill <id>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { CommandExitError, Sandbox } from 'e2b'
import { terminalLine } from '@/mods/terminal-line'

const STAGING_ENV = '/Users/nate/Documents/repos/statuslin.es/.env.staging'
const TEXT_MAX_CHARS = 64 * 1024
export const PNG_MAX_BYTES = 8 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function stagingE2bKey(): string {
  const line = readFileSync(STAGING_ENV, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('E2B_API_KEY='))
  const key = line?.slice('E2B_API_KEY='.length).trim().replace(/^"|"$/g, '')
  if (!key) throw new Error('E2B_API_KEY is not in .env.staging')
  return key
}

export function capText(text: string): string {
  if (text.length <= TEXT_MAX_CHARS) return text
  return `${text.slice(0, TEXT_MAX_CHARS)}\n[truncated ${text.length - TEXT_MAX_CHARS} chars]`
}

/** Checks hostile PNG bytes before they touch disk. */
export function checkedPng(bytes: Uint8Array): Buffer {
  const buf = Buffer.from(bytes)
  if (buf.length > PNG_MAX_BYTES) throw new Error(`PNG is ${buf.length} bytes, over the cap`)
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)')
  return buf
}

/** Prints a hostile string with terminal control characters made visible. */
function show(text: string) {
  for (const line of capText(text).split('\n')) console.log(terminalLine(line))
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: throwaway spike driver, one linear script.
async function main() {
  const [verb, ...rest] = process.argv.slice(2)
  const dash = rest.indexOf('--')
  const head = dash === -1 ? rest : rest.slice(0, dash)
  const command = dash === -1 ? '' : rest.slice(dash + 1).join(' ')
  const { values, positionals } = parseArgs({
    args: head,
    options: {
      template: { type: 'string', default: 'base' },
      internet: { type: 'boolean', default: false },
      minutes: { type: 'string', default: '30' },
      root: { type: 'boolean', default: false },
      timeout: { type: 'string', default: '120' },
      display: { type: 'string', default: ':99' },
    },
    allowPositionals: true,
    strict: true,
  })
  const apiKey = stagingE2bKey()
  if (verb === 'create') {
    const sandbox = await Sandbox.create(values.template, {
      apiKey,
      allowInternetAccess: values.internet,
      timeoutMs: Number(values.minutes) * 60_000,
      secure: true,
    })
    console.log(sandbox.sandboxId)
    return
  }
  const [id, ...args] = positionals
  if (!id) throw new Error('sandbox id required')
  const sandbox = await Sandbox.connect(id, { apiKey })
  const user = values.root ? 'root' : 'user'
  switch (verb) {
    case 'run': {
      try {
        const out = await sandbox.commands.run(command, {
          user,
          timeoutMs: Number(values.timeout) * 1000,
        })
        show(out.stdout)
        if (out.stderr) show(`[stderr]\n${out.stderr}`)
      } catch (error) {
        if (!(error instanceof CommandExitError)) throw error
        show(error.stdout)
        show(`[stderr]\n${error.stderr}`)
        show(`[exit ${error.exitCode}]`)
      }
      return
    }
    case 'bg': {
      const handle = await sandbox.commands.run(command, { user, background: true, timeoutMs: 0 })
      console.log(`pid ${handle.pid}`)
      await handle.disconnect()
      return
    }
    case 'put': {
      const [local, remote] = args
      if (!local || !remote) throw new Error('put <id> <local> <remote>')
      await sandbox.files.write(remote, readFileSync(local).buffer as ArrayBuffer, { user })
      return
    }
    case 'shot': {
      const [local] = args
      if (!local) throw new Error('shot <id> <local.png>')
      const remote = '/tmp/spike-shot.png'
      await sandbox.commands.run(
        `DISPLAY=${values.display} import -window root ${remote} && stat -c %s ${remote}`,
        { user: 'user', timeoutMs: 30_000 },
      )
      const bytes = await sandbox.files.read(remote, { format: 'bytes', user: 'user' })
      writeFileSync(local, checkedPng(bytes))
      console.log(`saved ${local} (${bytes.length} bytes)`)
      return
    }
    case 'getpng': {
      const [remote, local] = args
      if (!remote || !local) throw new Error('getpng <id> <remote.png> <local.png>')
      const bytes = await sandbox.files.read(remote, { format: 'bytes', user })
      writeFileSync(local, checkedPng(bytes))
      console.log(`saved ${local} (${bytes.length} bytes)`)
      return
    }
    case 'kill':
      await sandbox.kill()
      return
    default:
      throw new Error(`unknown verb ${verb}`)
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(terminalLine(`[e2b-shell] ${error instanceof Error ? error.message : error}`))
      process.exit(1)
    },
  )
}
