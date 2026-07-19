// biome-ignore-all lint/style/useNamingConvention: keys mirror Anthropic's external JSON contract.
export const ANTHROPIC_USAGE_HOST = 'api.anthropic.com'
export const ANTHROPIC_USAGE_URL = `https://${ANTHROPIC_USAGE_HOST}/api/oauth/usage`
export const ANTHROPIC_USAGE_PREVIEW_TOKEN = 'statuslines-preview-oauth-token'
export const ANTHROPIC_USAGE_CA_PATH =
  '/usr/local/share/ca-certificates/statuslines-anthropic-usage-ca.crt'

const DEFAULT_SESSION_PERCENT = 18
const DEFAULT_SESSION_RESET_MS = 2 * 60 * 60 * 1000
const DEFAULT_WEEKLY_PERCENT = 9
const DEFAULT_WEEKLY_RESET_MS = 3 * 24 * 60 * 60 * 1000
const SCOPED_PERCENT = 15

type UsageWindow = { percent: number; resetsAt: string }

export interface AnthropicUsageResponse {
  limits: Array<{
    kind: 'session' | 'weekly_all' | 'weekly_scoped'
    group: 'session' | 'weekly'
    percent: number
    severity: 'normal'
    resets_at: string
    scope: null | { model: { id: null; display_name: 'Fable' }; surface: null }
    is_active: boolean
  }>
  spend: { enabled: false; percent: 0; severity: 'normal' }
  five_hour: { utilization: number; resets_at: string }
  seven_day: { utilization: number; resets_at: string }
  seven_day_fable: { utilization: number; resets_at: string }
  extra_usage: {
    is_enabled: false
    utilization: 0
    used_credits: 0
    monthly_limit: 0
  }
}

export function shouldMockAnthropicUsage(input: {
  readsClaudeToken?: boolean
  networkHosts?: string[]
}): boolean {
  return (
    input.readsClaudeToken === true && input.networkHosts?.includes(ANTHROPIC_USAGE_HOST) === true
  )
}

export function externalNetworkHosts(networkHosts: string[], mockEnabled: boolean): string[] {
  if (!mockEnabled) return [...networkHosts]
  return networkHosts.filter((host) => host !== ANTHROPIC_USAGE_HOST)
}

export function buildAnthropicUsageResponse(
  stdin: Record<string, unknown>,
  nowMs = Date.now(),
): AnthropicUsageResponse {
  const session = readWindow(
    stdin,
    'five_hour',
    DEFAULT_SESSION_PERCENT,
    nowMs + DEFAULT_SESSION_RESET_MS,
  )
  const weekly = readWindow(
    stdin,
    'seven_day',
    DEFAULT_WEEKLY_PERCENT,
    nowMs + DEFAULT_WEEKLY_RESET_MS,
  )

  return {
    limits: [
      {
        kind: 'session',
        group: 'session',
        percent: session.percent,
        severity: 'normal',
        resets_at: session.resetsAt,
        scope: null,
        is_active: false,
      },
      {
        kind: 'weekly_all',
        group: 'weekly',
        percent: weekly.percent,
        severity: 'normal',
        resets_at: weekly.resetsAt,
        scope: null,
        is_active: false,
      },
      {
        kind: 'weekly_scoped',
        group: 'weekly',
        percent: SCOPED_PERCENT,
        severity: 'normal',
        resets_at: weekly.resetsAt,
        scope: { model: { id: null, display_name: 'Fable' }, surface: null },
        is_active: true,
      },
    ],
    spend: { enabled: false, percent: 0, severity: 'normal' },
    five_hour: { utilization: session.percent, resets_at: session.resetsAt },
    seven_day: { utilization: weekly.percent, resets_at: weekly.resetsAt },
    seven_day_fable: { utilization: SCOPED_PERCENT, resets_at: weekly.resetsAt },
    extra_usage: {
      is_enabled: false,
      utilization: 0,
      used_credits: 0,
      monthly_limit: 0,
    },
  }
}

function readWindow(
  stdin: Record<string, unknown>,
  key: 'five_hour' | 'seven_day',
  defaultPercent: number,
  defaultResetMs: number,
): UsageWindow {
  const rateLimits = stdin.rate_limits
  if (rateLimits === undefined) {
    return { percent: defaultPercent, resetsAt: new Date(defaultResetMs).toISOString() }
  }
  if (!isRecord(rateLimits)) throw new Error('invalid rate_limits')

  const window = rateLimits[key]
  if (window === undefined) {
    return { percent: defaultPercent, resetsAt: new Date(defaultResetMs).toISOString() }
  }
  if (!isRecord(window)) throw new Error(`invalid rate_limits.${key}`)

  const percent = window.used_percentage
  const resetsAt = window.resets_at
  if (
    typeof percent !== 'number' ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100 ||
    typeof resetsAt !== 'number' ||
    !Number.isFinite(resetsAt) ||
    resetsAt <= 0
  ) {
    throw new Error(`invalid rate_limits.${key}`)
  }
  return { percent, resetsAt: new Date(resetsAt * 1000).toISOString() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
