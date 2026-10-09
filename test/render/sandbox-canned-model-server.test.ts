import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SERVER_PATH = resolve('src/render/sandbox-anthropic-usage-server.py')
const REPLY = {
  text: 'The repo is clean and the tests pass.',
  usage: {
    input_tokens: 37_000,
    output_tokens: 1_400,
    cache_creation_input_tokens: 5_000,
    cache_read_input_tokens: 2_000,
  },
}
const MODEL = 'claude-opus-4-8'

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address ? done(address.port) : fail()))
    })
  })
}

let server: ChildProcess
let baseUrl: string
let workDir: string

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'canned-model-'))
  const replyPath = join(workDir, 'reply.json')
  writeFileSync(replyPath, JSON.stringify(REPLY))
  const port = await freePort()
  baseUrl = `http://127.0.0.1:${port}`
  server = spawn('python3', [SERVER_PATH, '--port', String(port), '--canned-reply', replyPath], {
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      await fetch(`${baseUrl}/`).then(
        () => true,
        () => false,
      )
    )
      return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('canned model server did not start')
})

afterAll(() => {
  server?.kill()
  rmSync(workDir, { recursive: true, force: true })
})

function postJson(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const request = { model: MODEL, max_tokens: 1024, messages: [{ role: 'user', content: 'hello' }] }

describe('sandbox canned model server', () => {
  it('answers a non-streaming message with the canned reply', async () => {
    const res = await postJson('/v1/messages', request)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: expect.any(String),
      type: 'message',
      role: 'assistant',
      model: MODEL,
      content: [{ type: 'text', text: REPLY.text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: REPLY.usage,
    })
  })

  it('streams the canned reply as Messages API events', async () => {
    const res = await postJson('/v1/messages', { ...request, stream: true })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const events = (await res.text())
      .split('\n\n')
      .filter(Boolean)
      .map((block) => {
        const [eventLine, dataLine] = block.split('\n')
        return {
          event: eventLine?.replace('event: ', ''),
          data: JSON.parse(dataLine?.replace('data: ', '') ?? ''),
        }
      })
    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ])
    expect(events[0]?.data.message.model).toBe(MODEL)
    expect(events[2]?.data.delta).toEqual({ type: 'text_delta', text: REPLY.text })
    expect(events[4]?.data).toMatchObject({
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: REPLY.usage.output_tokens },
    })
  })

  it('counts tokens with the canned input size', async () => {
    const res = await postJson('/v1/messages/count_tokens', request)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ input_tokens: REPLY.usage.input_tokens })
  })
})
