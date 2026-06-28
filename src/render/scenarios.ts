import {
  COST,
  ENV,
  emptyUsage,
  FABLE,
  HAIKU,
  hm,
  OPUS,
  REPO,
  SESSION,
  SONNET,
  usage,
  VERSION,
  win,
} from './scenario-helpers'
import type { Scenario } from './types'

const RAW: Scenario[] = [
  {
    key: 'clean-main',
    label: 'Clean repo, everyday Opus session',
    shortLabel: 'Clean repo',
    stdin: {
      model: OPUS,
      effort: { level: 'high' },
      thinking: { enabled: true },
      workspace: {
        current_dir: '/home/user/app',
        project_dir: '/home/user/app',
        repo: REPO,
        added_dirs: [],
      },
      version: VERSION,
      cost: COST,
      context_window: usage(22),
      exceeds_200k_tokens: false,
      rate_limits: { five_hour: win(26, hm(2, 7)), seven_day: win(7, hm(49, 0)) },
      output_style: { name: 'default' },
      // PR open, not yet reviewed → review_state independently absent.
      pr: { number: 1287, url: 'https://github.com/acme/app/pull/1287' },
    },
    git: { branch: 'main', dirty: false },
    env: ENV,
  },
  {
    key: 'fresh-session',
    label: 'Brand-new session (token + rate-limit fields absent)',
    shortLabel: 'New session',
    stdin: {
      model: OPUS,
      effort: { level: 'high' },
      workspace: { current_dir: '/home/user/app', project_dir: '/home/user/app' },
      version: VERSION,
      cost: { ...COST, total_cost_usd: 0, total_lines_added: 0, total_lines_removed: 0 },
      context_window: emptyUsage(),
      exceeds_200k_tokens: false,
      output_style: { name: 'default' },
    },
    git: { branch: 'main', dirty: false },
    env: ENV,
  },
  {
    key: 'dirty-feature',
    label: 'Dirty feature branch on Sonnet, vim insert',
    shortLabel: 'Dirty branch',
    stdin: {
      model: SONNET,
      effort: { level: 'medium' },
      thinking: { enabled: true },
      workspace: {
        current_dir: '/home/user/app',
        project_dir: '/home/user/app',
        repo: REPO,
        git_worktree: 'feat-auth',
      },
      version: VERSION,
      cost: COST,
      context_window: usage(48),
      exceeds_200k_tokens: false,
      rate_limits: { five_hour: win(40, hm(1, 12)), seven_day: win(18, hm(70, 0)) },
      output_style: { name: 'default' },
      vim: { mode: 'INSERT' },
      pr: { number: 1290, url: 'https://github.com/acme/app/pull/1290', review_state: 'pending' },
    },
    git: { branch: 'feat/auth', dirty: true },
    env: ENV,
  },
  {
    key: 'near-full',
    label: 'Context near-full, effort max, rate limits hot',
    shortLabel: 'Near-full',
    stdin: {
      model: OPUS,
      effort: { level: 'max' },
      thinking: { enabled: true },
      workspace: { current_dir: '/home/user/app', project_dir: '/home/user/app', repo: REPO },
      version: VERSION,
      cost: { ...COST, total_cost_usd: 4.12 },
      context_window: usage(91),
      exceeds_200k_tokens: true,
      rate_limits: { five_hour: win(88, hm(0, 18)), seven_day: win(61, hm(20, 0)) },
      output_style: { name: 'Explanatory' },
      vim: { mode: 'VISUAL' },
      pr: {
        number: 1290,
        url: 'https://github.com/acme/app/pull/1290',
        review_state: 'changes_requested',
      },
    },
    git: { branch: 'main', dirty: false },
    env: ENV,
  },
  {
    key: 'big-context',
    label: '1M-context session on Fable, effort xhigh',
    shortLabel: '1M context',
    stdin: {
      model: FABLE,
      effort: { level: 'xhigh' },
      thinking: { enabled: true },
      workspace: { current_dir: '/home/user/app', project_dir: '/home/user/app', repo: REPO },
      version: VERSION,
      cost: COST,
      context_window: usage(64, 1_000_000),
      exceeds_200k_tokens: true,
      rate_limits: { five_hour: win(33, hm(3, 30)), seven_day: win(12, hm(120, 0)) },
      output_style: { name: 'default' },
      pr: { number: 1290, url: 'https://github.com/acme/app/pull/1290', review_state: 'approved' },
    },
    git: { branch: 'main', dirty: false },
    env: ENV,
  },
  {
    key: 'post-compact',
    label: 'Just after /compact, Haiku (no effort), partial rate limits',
    shortLabel: 'Post-compact',
    stdin: {
      model: HAIKU,
      // Haiku has no effort param → the field is absent.
      workspace: { current_dir: '/home/user/app', project_dir: '/home/user/app', repo: REPO },
      version: VERSION,
      cost: COST,
      context_window: emptyUsage(),
      exceeds_200k_tokens: false,
      // Only the five-hour window has reported yet.
      rate_limits: { five_hour: win(52, hm(4, 2)) },
      output_style: { name: 'default' },
      vim: { mode: 'NORMAL' },
    },
    git: { branch: 'main', dirty: false },
    env: ENV,
  },
  {
    key: 'worktree',
    label: 'Worktree session, effort low, draft PR, vim visual-line',
    shortLabel: 'Worktree',
    stdin: {
      model: OPUS,
      effort: { level: 'low' },
      workspace: {
        current_dir: '/home/user/.wt/feature',
        project_dir: '/home/user/app',
        repo: REPO,
        git_worktree: 'feature',
      },
      version: VERSION,
      cost: COST,
      context_window: usage(37),
      exceeds_200k_tokens: false,
      rate_limits: { five_hour: win(44, hm(2, 50)), seven_day: win(20, hm(31, 0)) },
      output_style: { name: 'default' },
      vim: { mode: 'VISUAL LINE' },
      pr: { number: 1301, url: 'https://github.com/acme/app/pull/1301', review_state: 'draft' },
      worktree: {
        name: 'feature',
        path: '/home/user/.wt/feature',
        branch: 'worktree-feature',
        original_cwd: '/home/user/app',
        original_branch: 'main',
      },
    },
    git: { branch: 'worktree-feature', dirty: false },
    env: ENV,
  },
  {
    key: 'non-git',
    label: 'Non-git scratch dir, named session, sub-agent, added dirs',
    shortLabel: 'Non-git',
    stdin: {
      model: OPUS,
      effort: { level: 'high' },
      thinking: { enabled: false },
      session_name: 'refactor-pass',
      agent: { name: 'code-reviewer' },
      workspace: {
        current_dir: '/home/user/scratch',
        project_dir: '/home/user/scratch',
        added_dirs: ['/home/user/lib', '/home/user/shared'],
      },
      version: VERSION,
      cost: COST,
      context_window: usage(22),
      exceeds_200k_tokens: false,
      output_style: { name: 'default' },
    },
    git: null,
    env: ENV,
  },
]

// Inject the always-present fields (cwd mirrors workspace.current_dir; session ids are constant)
// so every scenario carries the full top-level schema without repeating it eight times.
export const SCENARIOS: Scenario[] = RAW.map((s) => {
  const cwd = (s.stdin.workspace as { current_dir?: string } | undefined)?.current_dir
  if (!cwd) throw new Error(`scenario "${s.key}" is missing workspace.current_dir`)
  return { ...s, stdin: { ...SESSION, cwd, ...s.stdin } }
})

// Scenario metadata by key, for label lookup when rendering stored previews (which carry only the
// scenarioKey, not the label). Used by the detail page and the admin review disclosure.
export const SCENARIO_BY_KEY: ReadonlyMap<string, Scenario> = new Map(
  SCENARIOS.map((s) => [s.key, s]),
)

const SCENARIO_ORDER: ReadonlyMap<string, number> = new Map(SCENARIOS.map((s, i) => [s.key, i]))

/**
 * Sort anything keyed by `scenarioKey` (previews, rows) into the canonical SCENARIOS order, so
 * previews always display in the same intentional order rather than DB/query order. Returns a new
 * array; the input is not mutated. Unknown keys sort to the end.
 */
export function orderByScenario<T extends { scenarioKey: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (SCENARIO_ORDER.get(a.scenarioKey) ?? Number.MAX_SAFE_INTEGER) -
      (SCENARIO_ORDER.get(b.scenarioKey) ?? Number.MAX_SAFE_INTEGER),
  )
}
