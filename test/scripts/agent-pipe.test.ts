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

  // Production's requests outgrew the pipe buffer and a reader left early, which killed the run.
  it('hands the requests out again when a reader closes the pipe before reading all of it', async () => {
    const reopened: string[] = []
    const pipe = await openAgentPipe(() => reopened.push('again'))
    const text = 'x'.repeat(300_000)

    const sending = pipe.send(text)
    await shell(`head -c 10 '${pipe.requests}' > /dev/null`)
    const [, received] = await Promise.all([sending, shell(`cat '${pipe.requests}'`)])

    expect(received).toBe(text)
    expect(reopened).toEqual(['again'])
    pipe.close()
  })
})
