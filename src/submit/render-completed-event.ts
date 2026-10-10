import type { ServerEvent } from '@/lib/posthog-server'
import { INFRA_ERROR_EXIT_CODE } from '@/render/e2b-runner'

/** PostHog distinct id every render-worker event is attributed to (it's a process, not a person). */
export const RENDER_WORKER_DISTINCT_ID = 'render-worker'

/** How one scenario's sandbox run ended — exit status only, never its output. */
interface ScenarioOutcome {
  exitCode: number
  timedOut: boolean
}

/** What the worker knows when a render job finishes. Ids are null when the job failed before its
 * version was found. `scenarios` is null when the job threw (status 'failed', nothing stored). */
export interface RenderJobReport {
  configId: string | null
  versionId: string
  slug: string | null
  durationMs: number
  scenarios: ScenarioOutcome[] | null
}

/** Coarse, fixed failure classes — the event never carries raw stderr or script output. */
type RenderErrorClass = 'job_failed' | 'sandbox_error' | 'timeout' | 'nonzero_exit'

/** Most severe class first: our infra failing outranks a slow script, which outranks a non-zero exit. */
function classify(scenarios: ScenarioOutcome[] | null): RenderErrorClass | null {
  if (scenarios === null) return 'job_failed'
  if (scenarios.some((s) => s.exitCode === INFRA_ERROR_EXIT_CODE)) return 'sandbox_error'
  if (scenarios.some((s) => s.timedOut)) return 'timeout'
  if (scenarios.some((s) => s.exitCode !== 0)) return 'nonzero_exit'
  return null
}

/**
 * Build the per-job render event. `outcome` is 'failure' when the job threw OR any scenario didn't
 * render cleanly — a 'done' job with a timed-out scenario still reaches review, but its preview is
 * broken, so it counts. Properties are copied field by field from a fixed allowlist: submitted
 * scripts are untrusted, so no script bytes or output may reach PostHog (see SECURITY.md).
 */
export function renderCompletedEvent(report: RenderJobReport): ServerEvent {
  const errorClass = classify(report.scenarios)
  return {
    distinctId: RENDER_WORKER_DISTINCT_ID,
    event: 'statusline_render_completed',
    properties: {
      outcome: errorClass ? 'failure' : 'success',
      ...(errorClass ? { errorClass } : {}),
      durationMs: report.durationMs,
      configId: report.configId,
      versionId: report.versionId,
      slug: report.slug,
      // biome-ignore lint/style/useNamingConvention: PostHog's reserved property name.
      $process_person_profile: false,
    },
  }
}
