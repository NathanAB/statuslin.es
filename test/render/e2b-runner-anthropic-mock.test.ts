import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_USAGE_CA_PATH,
  ANTHROPIC_USAGE_HOST,
  ANTHROPIC_USAGE_PREVIEW_TOKEN,
} from '@/render/anthropic-usage-mock'
import {
  anthropicUsageMockFiles,
  anthropicUsageSetupScript,
} from '@/render/anthropic-usage-sandbox'
import { buildRunEnv } from '@/render/e2b-runner'

describe('E2B Anthropic usage mock setup', () => {
  it('adds renderer-owned credentials and CA trust after filtering scenario env', () => {
    expect(
      buildRunEnv(
        {
          COLUMNS: '90',
          LINES: '30',
          CLAUDE_CODE_OAUTH_TOKEN: 'scenario-token',
          NODE_EXTRA_CA_CERTS: '/tmp/scenario-ca',
          PATH: '/tmp/hostile-path',
        },
        true,
      ),
    ).toEqual({
      COLUMNS: '90',
      LINES: '30',
      CLAUDE_CODE_OAUTH_TOKEN: ANTHROPIC_USAGE_PREVIEW_TOKEN,
      NODE_EXTRA_CA_CERTS: ANTHROPIC_USAGE_CA_PATH,
    })
    expect(
      buildRunEnv({ COLUMNS: '90', CLAUDE_CODE_OAUTH_TOKEN: 'scenario-token' }, false),
    ).toEqual({ COLUMNS: '90' })
  })

  it('builds only a dummy credential and scenario-derived response fixture', () => {
    const nowMs = Date.UTC(2026, 6, 18, 20, 0, 0)
    const files = anthropicUsageMockFiles({}, nowMs)

    expect(files).toHaveLength(2)
    const credentials = files.find((file) => file.path.endsWith('/.credentials.json'))
    expect(JSON.parse(credentials?.data ?? '')).toEqual({
      claudeAiOauth: { accessToken: ANTHROPIC_USAGE_PREVIEW_TOKEN },
    })
    const response = files.find((file) => file.path.includes('usage-response'))
    expect(JSON.parse(response?.data ?? '').five_hour.utilization).toBe(18)
    expect(files.map((file) => file.data).join('\n')).not.toMatch(/sk-ant|oauth_[a-z0-9]{10}/i)
  })

  it('installs root-only state, maps only the exact host, and waits for local HTTPS readiness', () => {
    const script = anthropicUsageSetupScript()

    expect(script).toContain('install -o root -g root -m 0400')
    expect(script).toContain(`127.0.0.1 ${ANTHROPIC_USAGE_HOST}`)
    expect(script).toContain('nohup python3 /opt/statuslines/anthropic-usage/server.py')
    expect(script).toContain(`--token ${ANTHROPIC_USAGE_PREVIEW_TOKEN}`)
    expect(script).toContain(`--cacert ${ANTHROPIC_USAGE_CA_PATH}`)
    expect(script).toContain(`chmod 0444 ${ANTHROPIC_USAGE_CA_PATH}`)
    expect(script).toContain(`--resolve ${ANTHROPIC_USAGE_HOST}:443:127.0.0.1`)
    expect(script).toContain(`https://${ANTHROPIC_USAGE_HOST}/api/oauth/usage`)
    expect(script).not.toContain('curl https://api.anthropic.com')
    const syntax = spawnSync('bash', ['-n', '-c', script], { encoding: 'utf8' })
    expect(syntax.status, syntax.stderr).toBe(0)
  })
})
