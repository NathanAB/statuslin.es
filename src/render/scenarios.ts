import { SESSION } from './scenario-helpers'
import { RAW_SCENARIOS } from './scenario-list'
import type { Scenario } from './types'

// Inject the always-present fields (cwd mirrors workspace.current_dir; SESSION holds the ones every
// scenario shares) so each carries the full top-level schema without repeating it eight times.
export const SCENARIOS: Scenario[] = RAW_SCENARIOS.map((s) => {
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
