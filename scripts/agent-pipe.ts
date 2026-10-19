import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Two named pipes in a fresh private temp folder, for a process running in the operator's terminal
 * to talk to the operator's agent, whose own shell can't type into that terminal. The agent runs
 * `cat <requests>` to take what `send` writes, and writes its answer with `... > <input>` for `read`.
 * A named pipe holds nothing on disk, so no request or response is ever written to a file.
 */
export interface AgentPipe {
  dir: string
  requests: string
  input: string
  /** Resolves once the agent has read all of it. */
  send: (text: string) => Promise<void>
  /** Resolves with everything the agent wrote, once it closes the pipe. */
  read: () => Promise<string>
  close: () => void
}

export async function openAgentPipe(): Promise<AgentPipe> {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pipe-'))
  const requests = join(dir, 'requests')
  const input = join(dir, 'input')
  const made = spawnSync('mkfifo', ['-m', '600', requests, input], { encoding: 'utf8' })
  if (made.status !== 0) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`mkfifo failed: ${made.stderr}`)
  }
  return {
    dir,
    requests,
    input,
    send: (text) => writeFile(requests, text),
    read: () => readFile(input, 'utf8'),
    close: () => rmSync(dir, { recursive: true, force: true }),
  }
}
