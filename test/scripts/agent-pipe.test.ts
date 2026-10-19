import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openAgentPipe } from '../../scripts/agent-pipe'

/** What the agent does from its own shell: `cat` a pipe, or write into one. */
function shell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command])
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', () => resolve(out))
  })
}

describe('openAgentPipe', () => {
  it('hands requests out and reads answers in through named pipes, leaving no files', async () => {
    const pipe = await openAgentPipe()
    expect(readdirSync(pipe.dir).every((name) => statSync(`${pipe.dir}/${name}`).isFIFO())).toBe(
      true,
    )

    const [, received] = await Promise.all([
      pipe.send('{"ask":1}'),
      shell(`cat '${pipe.requests}'`),
    ])
    expect(received).toBe('{"ask":1}')

    const [answer] = await Promise.all([
      pipe.read(),
      shell(`printf 'publish 2 to staging\\n' > '${pipe.input}'`),
    ])
    expect(answer).toBe('publish 2 to staging\n')

    pipe.close()
    expect(existsSync(pipe.dir)).toBe(false)
  })
})
