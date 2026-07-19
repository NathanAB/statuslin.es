import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SERVER_PATH = resolve('src/render/sandbox-anthropic-usage-server.py')

describe('sandbox Anthropic usage server', () => {
  it('routes only the exact authenticated usage request', () => {
    const result = spawnSync('python3', [SERVER_PATH, '--self-test'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      ok: 200,
      bad_auth: 401,
      bad_host: 404,
      bad_method: 404,
      bad_path: 404,
      unsupported_method: 404,
    })
  })
})
