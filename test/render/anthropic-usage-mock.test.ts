import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_USAGE_HOST,
  buildAnthropicUsageResponse,
  externalNetworkHosts,
  shouldMockAnthropicUsage,
} from '@/render/anthropic-usage-mock'

describe('Anthropic usage mock activation', () => {
  it('requires both token disclosure and the exact usage host', () => {
    expect(
      shouldMockAnthropicUsage({
        readsClaudeToken: true,
        networkHosts: [ANTHROPIC_USAGE_HOST],
      }),
    ).toBe(true)
    expect(
      shouldMockAnthropicUsage({
        readsClaudeToken: false,
        networkHosts: [ANTHROPIC_USAGE_HOST],
      }),
    ).toBe(false)
    expect(
      shouldMockAnthropicUsage({ readsClaudeToken: true, networkHosts: ['*.anthropic.com'] }),
    ).toBe(false)
    expect(shouldMockAnthropicUsage({ readsClaudeToken: true, networkHosts: [] })).toBe(false)
  })

  it('removes only the mocked host from external egress', () => {
    expect(externalNetworkHosts([ANTHROPIC_USAGE_HOST, 'api.github.com'], true)).toEqual([
      'api.github.com',
    ])
    expect(externalNetworkHosts([ANTHROPIC_USAGE_HOST, 'api.github.com'], false)).toEqual([
      ANTHROPIC_USAGE_HOST,
      'api.github.com',
    ])
  })
})

describe('buildAnthropicUsageResponse', () => {
  const nowMs = Date.UTC(2026, 6, 18, 20, 0, 0)

  it('mirrors resolved scenario windows into array and top-level response shapes', () => {
    const fiveHourReset = Math.floor(nowMs / 1000) + 2 * 60 * 60
    const sevenDayReset = Math.floor(nowMs / 1000) + 3 * 24 * 60 * 60
    const response = buildAnthropicUsageResponse(
      {
        rate_limits: {
          five_hour: { used_percentage: 26, resets_at: fiveHourReset },
          seven_day: { used_percentage: 7, resets_at: sevenDayReset },
        },
      },
      nowMs,
    )

    expect(response.limits).toEqual([
      {
        kind: 'session',
        group: 'session',
        percent: 26,
        severity: 'normal',
        resets_at: new Date(fiveHourReset * 1000).toISOString(),
        scope: null,
        is_active: false,
      },
      {
        kind: 'weekly_all',
        group: 'weekly',
        percent: 7,
        severity: 'normal',
        resets_at: new Date(sevenDayReset * 1000).toISOString(),
        scope: null,
        is_active: false,
      },
      {
        kind: 'weekly_scoped',
        group: 'weekly',
        percent: 15,
        severity: 'normal',
        resets_at: new Date(sevenDayReset * 1000).toISOString(),
        scope: { model: { id: null, display_name: 'Fable' }, surface: null },
        is_active: true,
      },
    ])
    expect(response.five_hour).toEqual({
      utilization: 26,
      resets_at: new Date(fiveHourReset * 1000).toISOString(),
    })
    expect(response.seven_day).toEqual({
      utilization: 7,
      resets_at: new Date(sevenDayReset * 1000).toISOString(),
    })
    expect(response.seven_day_fable).toEqual({
      utilization: 15,
      resets_at: new Date(sevenDayReset * 1000).toISOString(),
    })
    expect(response.spend).toEqual({ enabled: false, percent: 0, severity: 'normal' })
    expect(response.extra_usage).toEqual({
      is_enabled: false,
      utilization: 0,
      used_credits: 0,
      monthly_limit: 0,
    })
  })

  it('uses fixed live defaults when account windows are absent from stdin', () => {
    const response = buildAnthropicUsageResponse({}, nowMs)

    expect(response.five_hour).toEqual({
      utilization: 18,
      resets_at: new Date(nowMs + 2 * 60 * 60 * 1000).toISOString(),
    })
    expect(response.seven_day).toEqual({
      utilization: 9,
      resets_at: new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString(),
    })
  })

  it('rejects a present but malformed trusted rate-limit window', () => {
    expect(() =>
      buildAnthropicUsageResponse(
        { rate_limits: { five_hour: { used_percentage: '26', resets_at: 123 } } },
        nowMs,
      ),
    ).toThrow('invalid rate_limits.five_hour')
  })
})
