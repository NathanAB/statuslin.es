import { describe, expect, it } from 'vitest'
import { INFRA_ERROR_EXIT_CODE } from '@/render/e2b-runner'
import {
  RENDER_WORKER_DISTINCT_ID,
  type RenderJobReport,
  renderCompletedEvent,
} from '@/submit/render-completed-event'

const clean = { exitCode: 0, timedOut: false }

function report(overrides: Partial<RenderJobReport> = {}): RenderJobReport {
  return {
    configId: 'c1',
    versionId: 'v1',
    slug: 'cool-line',
    durationMs: 1234,
    scenarios: [clean, clean],
    ...overrides,
  }
}

describe('renderCompletedEvent', () => {
  it('builds the statusline_render_completed event, attributed to the render worker', () => {
    const evt = renderCompletedEvent(report())
    expect(evt.event).toBe('statusline_render_completed')
    expect(evt.distinctId).toBe(RENDER_WORKER_DISTINCT_ID)
  })

  it('reports success with ids, slug and duration when every scenario rendered cleanly', () => {
    expect(renderCompletedEvent(report()).properties).toEqual({
      outcome: 'success',
      durationMs: 1234,
      configId: 'c1',
      versionId: 'v1',
      slug: 'cool-line',
      $process_person_profile: false,
    })
  })

  it('classifies a job that threw (no previews stored) as job_failed', () => {
    const props = renderCompletedEvent(report({ scenarios: null })).properties
    expect(props).toMatchObject({ outcome: 'failure', errorClass: 'job_failed' })
  })

  it('keeps unknown ids null when the job failed before the version was found', () => {
    const props = renderCompletedEvent(
      report({ configId: null, slug: null, scenarios: null }),
    ).properties
    expect(props).toMatchObject({ configId: null, slug: null, versionId: 'v1' })
  })

  it('classifies a scenario that exited non-zero as nonzero_exit', () => {
    const props = renderCompletedEvent(
      report({ scenarios: [clean, { exitCode: 1, timedOut: false }] }),
    ).properties
    expect(props).toMatchObject({ outcome: 'failure', errorClass: 'nonzero_exit' })
  })

  it('classifies a timed-out scenario as timeout, ahead of a non-zero exit', () => {
    const props = renderCompletedEvent(
      report({
        scenarios: [
          { exitCode: 1, timedOut: false },
          { exitCode: 124, timedOut: true },
        ],
      }),
    ).properties
    expect(props).toMatchObject({ outcome: 'failure', errorClass: 'timeout' })
  })

  it('classifies the runner infra-error exit as sandbox_error, ahead of a timeout', () => {
    const props = renderCompletedEvent(
      report({
        scenarios: [
          { exitCode: 124, timedOut: true },
          { exitCode: INFRA_ERROR_EXIT_CODE, timedOut: false },
        ],
      }),
    ).properties
    expect(props).toMatchObject({ outcome: 'failure', errorClass: 'sandbox_error' })
  })

  it('never copies fields beyond the fixed allowlist (no script output can leak in)', () => {
    const leaky = {
      ...report(),
      scenarios: [{ exitCode: 1, timedOut: false, rawStdout: 'SECRET', stderr: 'SECRET' }],
      source: 'SECRET',
    }
    const evt = renderCompletedEvent(leaky)
    expect(JSON.stringify(evt)).not.toContain('SECRET')
    expect(Object.keys(evt.properties).sort()).toEqual(
      [
        '$process_person_profile',
        'configId',
        'durationMs',
        'errorClass',
        'outcome',
        'slug',
        'versionId',
      ].sort(),
    )
  })
})
