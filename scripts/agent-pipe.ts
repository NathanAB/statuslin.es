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
  /** Resolves once the agent has read all of it; starts over when a reader leaves early. */
  send: (text: string) => Promise<void>
  /** Resolves with everything the agent wrote, once it closes the pipe. */
  read: () => Promise<string>
  close: () => void
}

/** Past this many readers that leave early, `send` gives up rather than wait forever. */
const MAX_SENDS = 5

/**
 * Text longer than the pipe's buffer is still being written when a reader closes its end, which
 * fails the write with EPIPE. `onReopen` says the agent has to read it again from the start.
 */
export async function openAgentPipe(onReopen: () => void = () => {}): Promise<AgentPipe> {
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
    send: async (text) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await writeFile(requests, text)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EPIPE' || attempt === MAX_SENDS)
            throw error
          onReopen()
        }
      }
    },
    read: () => readFile(input, 'utf8'),
    close: () => rmSync(dir, { recursive: true, force: true }),
  }
}
