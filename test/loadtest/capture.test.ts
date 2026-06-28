import { describe, expect, it } from 'vitest'
import {
  buildFlyQueries,
  csvHeader,
  csvRow,
  extractPromValue,
  METRIC_COLUMNS,
  parseDurationSeconds,
  toDirectUrl,
} from '../../scripts/loadtest/capture'

describe('parseDurationSeconds', () => {
  it('defaults to 600s when --duration is absent', () => {
    expect(parseDurationSeconds([])).toBe(600)
  })
  it('parses bare seconds, both --duration N and --duration=N', () => {
    expect(parseDurationSeconds(['--duration', '90'])).toBe(90)
    expect(parseDurationSeconds(['--duration=90'])).toBe(90)
  })
  it('parses s/m/h suffixes', () => {
    expect(parseDurationSeconds(['--duration', '45s'])).toBe(45)
    expect(parseDurationSeconds(['--duration=10m'])).toBe(600)
    expect(parseDurationSeconds(['--duration', '2h'])).toBe(7200)
  })
})

describe('buildFlyQueries', () => {
  it('covers every fly-derived metric column, each query scoped to the app', () => {
    const qs = buildFlyQueries('statuslines-staging')
    for (const { query } of qs) {
      expect(query).toContain('statuslines-staging')
    }
    const cols = qs.map((q) => q.column)
    for (const expected of [
      'cpu_busy_pct',
      'cpu_throttle',
      'cpu_balance',
      'mem_used_pct',
      'concurrency',
      'http_req_rate',
      'http_5xx_rate',
      'machines',
    ]) {
      expect(cols).toContain(expected)
    }
    // DB columns come from pg_stat_activity, not Fly — they must NOT be Fly queries.
    expect(cols).not.toContain('db_total')
    expect(cols).not.toContain('ts')
  })
})

describe('extractPromValue', () => {
  it('returns the numeric value from a Prometheus instant-query response', () => {
    const json = {
      status: 'success',
      data: { resultType: 'vector', result: [{ metric: {}, value: [1718000000, '42.5'] }] },
    }
    expect(extractPromValue(json)).toBe(42.5)
  })
  it('returns null for an empty result or malformed input', () => {
    expect(extractPromValue({ data: { result: [] } })).toBeNull()
    expect(extractPromValue(null)).toBeNull()
    expect(extractPromValue({})).toBeNull()
  })
})

describe('toDirectUrl', () => {
  it('strips -pooler from a Neon pooled host to get the direct (unpooled) URL', () => {
    const pooled =
      'postgresql://user:pass@ep-example-fixture-000000-pooler.c-9.us-east-1.aws.neon.tech/db?sslmode=require'
    const direct = toDirectUrl(pooled)
    expect(new URL(direct).hostname).toBe('ep-example-fixture-000000.c-9.us-east-1.aws.neon.tech')
    // Everything else is untouched (credentials, db, query params).
    expect(direct).toContain('user:pass@')
    expect(direct).toContain('/db')
    expect(direct).toContain('sslmode=require')
  })
  it('leaves an already-unpooled URL unchanged', () => {
    const direct = 'postgresql://u:p@ep-foo.c-9.us-east-1.aws.neon.tech/db?sslmode=require'
    expect(new URL(toDirectUrl(direct)).hostname).toBe('ep-foo.c-9.us-east-1.aws.neon.tech')
  })
})

describe('csv formatting', () => {
  it('header lists all columns in order', () => {
    expect(csvHeader()).toBe(METRIC_COLUMNS.join(','))
    expect(METRIC_COLUMNS[0]).toBe('ts')
  })
  it('row emits one cell per column, blank for missing/null', () => {
    const cells = csvRow({ ts: '2026-06-16T00:00:00Z', cpu_busy_pct: 42.5, db_active: 7 }).split(
      ',',
    )
    expect(cells.length).toBe(METRIC_COLUMNS.length)
    expect(cells[0]).toBe('2026-06-16T00:00:00Z')
    expect(cells[METRIC_COLUMNS.indexOf('cpu_busy_pct')]).toBe('42.5')
    expect(cells[METRIC_COLUMNS.indexOf('cpu_throttle')]).toBe('') // not provided → blank
  })
})
