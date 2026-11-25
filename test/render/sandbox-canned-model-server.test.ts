import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
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
const READ = { name: 'Read', input: { file_path: '/home/user/app/src/sum.js' } }
const BASH = { name: 'Bash', input: { command: 'npm test', description: 'Run the tests' } }
const SCRIPTED_REPLY = {
  ...REPLY,
  steps: [
    { text: 'Reading it first.', tool: READ },
    { text: '', tool: BASH },
  ],
}

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

interface RunningServer {
  baseUrl: string
  process: ChildProcess
}

let workDir: string
let plain: RunningServer
let scripted: RunningServer
let baseUrl: string

async function startServer(reply: unknown, name: string): Promise<RunningServer> {
  const replyPath = join(workDir, `${name}.json`)
  writeFileSync(replyPath, JSON.stringify(reply))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(
    'python3',
    [SERVER_PATH, '--port', String(port), '--canned-reply', replyPath],
    {
      stdio: 'ignore',
    },
  )
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      await fetch(`${url}/`).then(
        () => true,
        () => false,
      )
    )
      return { baseUrl: url, process: child }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('canned model server did not start')
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'canned-model-'))
  plain = await startServer(REPLY, 'reply')
  scripted = await startServer(SCRIPTED_REPLY, 'scripted')
  baseUrl = plain.baseUrl
})

afterAll(() => {
  plain?.process.kill()
  scripted?.process.kill()
  rmSync(workDir, { recursive: true, force: true })
})

function postJson(path: string, body: unknown, url = baseUrl) {
  return fetch(`${url}${path}`, {
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

  it('answers 400 to a non-numeric Content-Length and keeps serving', async () => {
    const { port } = new URL(baseUrl)
    const statusLine = await new Promise<string>((done, fail) => {
      const socket = connect(Number(port), '127.0.0.1', () => {
        socket.write('POST /v1/messages HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: abc\r\n\r\n')
      })
      let received = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => {
        received += chunk
      })
      socket.on('end', () => done(received.split('\r\n')[0] ?? ''))
      socket.on('error', fail)
    })

    expect(statusLine).toBe('HTTP/1.1 400 Bad Request')
    expect((await postJson('/v1/messages', request)).status).toBe(200)
    expect((await postJson('/v1/messages/count_tokens', request)).status).toBe(200)
  })

  it('refuses to serve canned replies as root', () => {
    const asRoot = [
      'import os, runpy, sys',
      'os.geteuid = lambda: 0',
      `sys.argv = ["server.py", "--port", "0", "--canned-reply", ${JSON.stringify(join(workDir, 'reply.json'))}]`,
      `runpy.run_path(${JSON.stringify(SERVER_PATH)}, run_name="__main__")`,
    ].join('\n')

    const result = spawnSync('python3', ['-c', asRoot], { encoding: 'utf8', timeout: 5_000 })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('refusing to run as root')
  })
})

const TOOLS = [{ name: 'Read' }, { name: 'Edit' }, { name: 'Bash' }].map((tool) => ({
  ...tool,
  input_schema: { type: 'object' },
}))

const toolResult = (id: string) => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }],
})

async function streamed(res: Response) {
  return (await res.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n')
      return {
        event: eventLine?.replace('event: ', ''),
        data: JSON.parse(dataLine?.replace('data: ', '') ?? ''),
      }
    })
}

describe('sandbox canned model server with scripted tool calls', () => {
  const ask = (body: object) => postJson('/v1/messages', body, scripted.baseUrl)

  it('answers the first turn with its text and tool call', async () => {
    const res = await ask({ ...request, tools: TOOLS })

    expect(await res.json()).toMatchObject({
      content: [
        { type: 'text', text: 'Reading it first.' },
        { type: 'tool_use', id: expect.any(String), ...READ },
      ],
      stop_reason: 'tool_use',
    })
  })

  it('answers the turn after one tool result with the next step, without empty text', async () => {
    const res = await ask({
      ...request,
      tools: TOOLS,
      messages: [...request.messages, { role: 'assistant', content: [] }, toolResult('a')],
    })

    expect(await res.json()).toMatchObject({
      content: [{ type: 'tool_use', ...BASH }],
      stop_reason: 'tool_use',
    })
  })

  it('gives each step its own message id, so Claude Code keeps the turns apart', async () => {
    const first = await (await ask({ ...request, tools: TOOLS })).json()
    const second = await (
      await ask({ ...request, tools: TOOLS, messages: [...request.messages, toolResult('a')] })
    ).json()
    const reply = await (await ask(request)).json()

    expect(new Set([first.id, second.id, reply.id]).size).toBe(3)
  })

  it('answers with the plain reply when the request does not offer the step tool', async () => {
    const res = await ask({ ...request, tools: [TOOLS[1]] })

    expect(await res.json()).toMatchObject({
      content: [{ type: 'text', text: REPLY.text }],
      stop_reason: 'end_turn',
    })
  })

  it('answers with the plain reply once every step has run', async () => {
    const res = await ask({
      ...request,
      tools: TOOLS,
      messages: [...request.messages, toolResult('a'), toolResult('b')],
    })

    expect(await res.json()).toMatchObject({
      content: [{ type: 'text', text: REPLY.text }],
      stop_reason: 'end_turn',
    })
  })

  it('streams a tool call as its input JSON', async () => {
    const events = await streamed(await ask({ ...request, tools: TOOLS, stream: true }))

    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ])
    expect(events[4]?.data.content_block).toEqual({
      type: 'tool_use',
      id: expect.any(String),
      name: READ.name,
      input: {},
    })
    expect(events[5]?.data.delta.type).toBe('input_json_delta')
    expect(JSON.parse(events[5]?.data.delta.partial_json)).toEqual(READ.input)
    expect(events[7]?.data.delta.stop_reason).toBe('tool_use')
  })
})
