import { describe, expect, it } from 'vitest'
import { resolveResets, usage } from '@/render/scenario-helpers'
import { SCENARIOS } from '@/render/scenarios'
import {
  DOCUMENTED_STDIN_FIELDS,
  DOCUMENTED_TOP_LEVEL_FIELDS,
} from '../helpers/statusline-stdin-fields'

// Helpers to read loosely-typed stdin fields off the scenarios.
type Obj = Record<string, unknown>
const stdins = () => SCENARIOS.map((s) => s.stdin as Obj)
function collect<T>(pick: (s: Obj) => T | undefined): T[] {
  return stdins()
    .map(pick)
    .filter((v): v is T => v !== undefined && v !== null)
}
const get = (o: unknown, k: string) => (o as Obj | undefined)?.[k]
/** Whether `stdin` carries the dotted `path`. A null leaf counts: the field is sent, as null. */
function sends(stdin: Obj, path: string): boolean {
  let node: unknown = stdin
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(key in node)) return false
    node = (node as Obj)[key]
  }
  return true
}

describe('SCENARIOS — exhaustive coverage of the statusline stdin schema', () => {
  it('has 8 scenarios with unique keys and shortLabels (≤13 chars)', () => {
    expect(SCENARIOS).toHaveLength(8)
    expect(new Set(SCENARIOS.map((s) => s.key)).size).toBe(8)
    expect(new Set(SCENARIOS.map((s) => s.shortLabel)).size).toBe(8)
    for (const s of SCENARIOS) {
      expect(s.shortLabel.length).toBeGreaterThan(0)
      expect(s.shortLabel.length).toBeLessThanOrEqual(13)
    }
  })

  it('every scenario carries model + workspace.current_dir', () => {
    for (const s of SCENARIOS) {
      expect(s.stdin.model).toBeDefined()
      expect((s.stdin.workspace as Obj | undefined)?.current_dir).toBeTruthy()
    }
  })

  it('every scenario carries the always-present top-level fields', () => {
    for (const s of SCENARIOS) {
      expect(typeof s.stdin.session_id).toBe('string')
      expect(typeof s.stdin.transcript_path).toBe('string')
      expect(typeof s.stdin.version).toBe('string')
      expect(s.stdin.cost).toBeDefined()
      expect(typeof s.stdin.fast_mode).toBe('boolean')
      // cwd mirrors workspace.current_dir
      expect(s.stdin.cwd).toBe((s.stdin.workspace as Obj).current_dir)
    }
  })

  it.each(DOCUMENTED_STDIN_FIELDS)('some scenario sends %s', (path) => {
    expect(stdins().some((s) => sends(s, path))).toBe(true)
  })

  it('sends only documented top-level fields', () => {
    for (const s of stdins()) {
      for (const key of Object.keys(s)) expect(DOCUMENTED_TOP_LEVEL_FIELDS).toContain(key)
    }
  })

  it('covers all four model families and the 1M context-window size', () => {
    const ids = collect((s) => get(s.model, 'id') as string).join(' ')
    for (const fam of ['opus', 'sonnet', 'haiku', 'fable']) expect(ids).toContain(fam)
    const sizes = collect((s) => get(s.context_window, 'context_window_size') as number)
    expect(sizes).toContain(1_000_000)
  })

  it('covers every effort level plus the effort-absent case', () => {
    const levels = collect((s) => get(s.effort, 'level') as string)
    for (const lvl of ['low', 'medium', 'high', 'xhigh', 'max']) expect(levels).toContain(lvl)
    expect(stdins().some((s) => s.effort === undefined)).toBe(true) // e.g. Haiku
  })

  it('covers thinking on and off', () => {
    const t = collect((s) => get(s.thinking, 'enabled') as boolean)
    expect(t).toContain(true)
    expect(t).toContain(false)
  })

  it('covers every vim mode plus vim-absent', () => {
    const modes = collect((s) => get(s.vim, 'mode') as string)
    for (const m of ['NORMAL', 'INSERT', 'VISUAL', 'VISUAL LINE']) expect(modes).toContain(m)
    expect(stdins().some((s) => s.vim === undefined)).toBe(true)
  })

  it('covers every PR review_state, a PR with review_state absent, and PR-absent', () => {
    const prs = stdins().map((s) => s.pr as Obj | undefined)
    const states = prs.map((p) => get(p, 'review_state') as string).filter(Boolean)
    for (const st of ['pending', 'approved', 'changes_requested', 'draft']) {
      expect(states).toContain(st)
    }
    // a PR object present but without review_state (the independently-absent edge)
    expect(prs.some((p) => p !== undefined && get(p, 'review_state') === undefined)).toBe(true)
    // at least one scenario with no PR at all
    expect(prs.some((p) => p === undefined)).toBe(true)
  })

  it('covers a GitLab merge request (pr.kind mr) in a nested-namespace gitlab.com repo', () => {
    const mr = stdins().find((s) => get(s.pr, 'kind') === 'mr')
    if (!mr) throw new Error('no scenario has a GitLab merge request')
    expect(get(mr.pr, 'url')).toMatch(/\/-\/merge_requests\/\d+$/)
    // GitLab merge requests only ever report these three states.
    expect(['approved', 'pending', 'draft']).toContain(get(mr.pr, 'review_state'))
    const repo = get(mr.workspace, 'repo')
    expect(get(repo, 'host')).toBe('gitlab.com')
    expect(get(repo, 'owner')).toContain('/') // subgroup path, e.g. "group/subgroup"
    // GitHub PRs leave kind absent
    expect(stdins().some((s) => s.pr !== undefined && get(s.pr, 'kind') === undefined)).toBe(true)
  })

  it('covers rate_limits present (both), absent, and partial (one window)', () => {
    const rl = stdins().map((s) => s.rate_limits as Obj | undefined)
    expect(rl.some((r) => get(r, 'five_hour') && get(r, 'seven_day'))).toBe(true) // both
    expect(rl.some((r) => r === undefined)).toBe(true) // absent
    expect(rl.some((r) => r !== undefined && (!get(r, 'five_hour') || !get(r, 'seven_day')))).toBe(
      true,
    ) // partial
  })

  it('covers a gateway spend limit with its dollar fields and without them', () => {
    const limits = collect((s) => get(s.rate_limits, 'spend_limit') as Obj)
    for (const l of limits) {
      expect(typeof l.used_percentage).toBe('number')
      expect(typeof l.resets_at).toBe('number')
      if (l.period !== undefined) expect(['daily', 'weekly', 'monthly']).toContain(l.period)
    }
    const dollars = (l: Obj) => [l.used_usd, l.limit_usd, l.period]
    expect(limits.some((l) => dollars(l).every((v) => v !== undefined))).toBe(true)
    expect(limits.some((l) => dollars(l).every((v) => v === undefined))).toBe(true)
  })

  it('covers prompt_cache absent, warm and cold, both TTLs, and each nullable field null and set', () => {
    expect(stdins().some((s) => s.prompt_cache === undefined)).toBe(true)
    const caches = collect((s) => s.prompt_cache as Obj)
    const fields = DOCUMENTED_STDIN_FIELDS.filter((p) => p.startsWith('prompt_cache.')).map((p) =>
      p.replace('prompt_cache.', '').replace(/\..*/, ''),
    )
    for (const c of caches) for (const f of fields) expect(f in c).toBe(true)
    expect(caches.map((c) => c.warm)).toEqual(expect.arrayContaining([true, false]))
    expect(caches.map((c) => c.ttl)).toEqual(expect.arrayContaining(['5m', '1h']))
    for (const f of ['expires_at', 'last_miss_at', 'last_miss_cause', 'recache_tokens_if_cold']) {
      expect(caches.some((c) => c[f] === null)).toBe(true)
      expect(caches.some((c) => c[f] !== null)).toBe(true)
    }
  })

  it('covers prompt_id before the first prompt (absent) and after, and fast mode on and off', () => {
    expect(stdins().some((s) => typeof s.prompt_id === 'string')).toBe(true)
    expect(stdins().some((s) => s.prompt_id === undefined)).toBe(true)
    const fast = stdins().map((s) => s.fast_mode)
    expect(fast).toContain(true)
    expect(fast).toContain(false)
  })

  it('models all-model and Fable weekly usage both behind and ahead of even reset pace', () => {
    const weekSeconds = 7 * 24 * 60 * 60
    const paceState = (key: string) => {
      const scenario = SCENARIOS.find((candidate) => candidate.key === key)
      if (!scenario) throw new Error(`${key} missing`)
      const weekly = get(scenario.stdin.rate_limits, 'seven_day') as Obj
      const resetOffset = get(weekly, 'resets_at') as number
      const elapsedPercent = ((weekSeconds - resetOffset) / weekSeconds) * 100
      return {
        allModelsAhead: (get(weekly, 'used_percentage') as number) > elapsedPercent,
        fableAhead: (scenario.anthropicUsage?.fableWeeklyPercent ?? 0) > elapsedPercent,
      }
    }

    expect(paceState('clean-main')).toEqual({ allModelsAhead: false, fableAhead: false })
    expect(paceState('big-context')).toEqual({ allModelsAhead: true, fableAhead: true })
    expect(SCENARIOS.find((scenario) => scenario.key === 'clean-main')?.anthropicUsage).toEqual({
      fableWeeklyPercent: 15,
    })
    expect(SCENARIOS.find((scenario) => scenario.key === 'big-context')?.anthropicUsage).toEqual({
      fableWeeklyPercent: 80,
    })
  })

  it('covers context states: null usage, near-full, and exceeds_200k', () => {
    const nullUsage = stdins().filter(
      (s) => (get(s.context_window, 'current_usage') ?? null) === null,
    )
    expect(nullUsage.length).toBeGreaterThanOrEqual(2) // fresh + post-compact
    const pcts = collect((s) => get(s.context_window, 'used_percentage') as number)
    expect(pcts.some((p) => p >= 90)).toBe(true) // near-full
    expect(collect((s) => s.exceeds_200k_tokens as boolean)).toContain(true)
  })

  it('covers output_style default and a custom style', () => {
    const names = collect((s) => get(s.output_style, 'name') as string)
    expect(names).toContain('default')
    expect(names.some((n) => n !== 'default')).toBe(true)
  })

  it('covers workspace repo present/absent, git_worktree, added_dirs, and a worktree session', () => {
    const ws = stdins().map((s) => s.workspace as Obj)
    expect(ws.some((w) => get(w, 'repo'))).toBe(true)
    expect(ws.some((w) => get(w, 'repo') === undefined)).toBe(true)
    expect(ws.some((w) => get(w, 'git_worktree'))).toBe(true)
    expect(
      ws.some((w) => Array.isArray(get(w, 'added_dirs')) && (get(w, 'added_dirs') as []).length),
    ).toBe(true)
    expect(stdins().some((s) => s.worktree !== undefined)).toBe(true)
  })

  it('covers session_name and agent present', () => {
    expect(stdins().some((s) => typeof s.session_name === 'string')).toBe(true)
    expect(stdins().some((s) => s.agent !== undefined)).toBe(true)
  })

  it('covers git clean, dirty, and non-git', () => {
    expect(SCENARIOS.some((s) => s.git?.dirty === false)).toBe(true)
    expect(SCENARIOS.some((s) => s.git?.dirty === true)).toBe(true)
    expect(SCENARIOS.some((s) => s.git === null)).toBe(true)
  })

  it('resolveResets turns rate-limit offsets into now+offset epochs, without mutating', () => {
    const s = SCENARIOS.find((x) => x.key === 'clean-main')
    if (!s) throw new Error('clean-main missing')
    const win = (o: Obj) => get(get(o, 'rate_limits'), 'five_hour') as Obj
    const offset = get(win(s.stdin as Obj), 'resets_at') as number
    expect(offset).toBeLessThan(1_000_000) // it's a small offset, not an epoch
    const out = resolveResets(s.stdin as Obj, 2_000_000) as Obj
    expect(get(win(out), 'resets_at')).toBe(2_000_000 + offset)
    expect(get(win(s.stdin as Obj), 'resets_at')).toBe(offset) // original untouched
  })

  it('resolveResets resolves spend-limit and prompt-cache offsets too, leaving nulls null', () => {
    const stdin = {
      rate_limits: { spend_limit: { used_percentage: 12, resets_at: 600 } },
      prompt_cache: { warm: true, expires_at: 300, last_miss_at: -120 },
    }
    expect(resolveResets(stdin, 1_000_000)).toEqual({
      rate_limits: { spend_limit: { used_percentage: 12, resets_at: 1_000_600 } },
      prompt_cache: { warm: true, expires_at: 1_000_300, last_miss_at: 999_880 },
    })
    expect(stdin.prompt_cache.expires_at).toBe(300) // original untouched
    const cold = { prompt_cache: { warm: false, expires_at: null, last_miss_at: null } }
    expect(resolveResets(cold, 1_000_000)).toEqual(cold)
  })

  it('resolveResets leaves stdin without rate_limits or prompt_cache unchanged', () => {
    const s = SCENARIOS.find((x) => x.key === 'fresh-session')
    if (!s) throw new Error('fresh-session missing')
    expect(resolveResets(s.stdin as Obj, 123)).toEqual(s.stdin)
  })

  it('usage never produces negative token counts at low percentages', () => {
    const cw = usage(1) as Obj
    expect((get(cw, 'current_usage') as Obj).input_tokens).toBeGreaterThanOrEqual(0)
  })
})
