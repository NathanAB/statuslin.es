import { describe, expect, it } from 'vitest'
import type { Release } from '../../scripts/check-mod-updates'
import { fenced, MAX_BODY_CHARS, modUpdatesPrBody } from '../../scripts/mod-updates-pr-body'

const REPO = 'https://github.com/octocat/meters'
const PIN = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const COMPARE = `${REPO}/compare/${PIN}...${HEAD}`

const release = (overrides: Partial<Release['entry']> = {}): Release => ({
  entry: {
    repoUrl: REPO,
    path: 'plugins/meter',
    commitSha: PIN,
    pluginName: 'meter',
    title: 'Meter',
    inputSteps: [],
    ...overrides,
  },
  head: HEAD,
  from: '1.2.0',
  to: '1.3.0',
})

describe('modUpdatesPrBody', () => {
  it('labels the agent review advisory and gives the folder and compare link with it', () => {
    const body = modUpdatesPrBody({
      releases: [release()],
      reviews: [{ kind: 'reviewed', text: 'Verdict: no concerns' }],
      notes: [],
    })

    expect(body).toContain('| meter | `plugins/meter` |')
    expect(body).toContain('## Agent reviews (advisory, not an approval)')
    expect(body).toContain(`### meter\n\nFolder \`plugins/meter\`, changes: ${COMPARE}`)
    expect(body).toContain('```text\nVerdict: no concerns\n```')
    expect(body).toMatch(/read each compare link before merging/i)
  })

  it('shows a failed review as not reviewed, with no verdict', () => {
    const body = modUpdatesPrBody({
      releases: [release({ path: '' })],
      reviews: [{ kind: 'not reviewed', reason: 'claude exited 1: Failed to authenticate' }],
      notes: [],
    })

    expect(body).toContain(`### meter\n\nFolder the repository root, changes: ${COMPARE}`)
    expect(body).toContain(
      '**Not reviewed** by an agent. Read the compare link.\n\n```text\nclaude exited 1: Failed to authenticate\n```',
    )
    expect(body).not.toContain('Verdict')
  })

  it('lists the mods it did not re-pin, fenced', () => {
    const body = modUpdatesPrBody({
      releases: [release()],
      reviews: [{ kind: 'reviewed', text: 'Verdict: no concerns' }],
      notes: ['ahead deck: version unchanged (0.4.12), not re-pinned'],
    })

    expect(body).toContain(
      '## Not re-pinned\n\n```text\nahead deck: version unchanged (0.4.12), not re-pinned\n```',
    )
  })

  it('leaves out the not re-pinned section when there is nothing in it', () => {
    const body = modUpdatesPrBody({
      releases: [release()],
      reviews: [{ kind: 'reviewed', text: 'Verdict: no concerns' }],
      notes: [],
    })

    expect(body).not.toContain('Not re-pinned')
  })
})

describe('modUpdatesPrBody size', () => {
  it('cuts the reviews to stay under GitHub’s body limit, pointing at the compare links', () => {
    const releases = Array.from({ length: 12 }, (_, i) => release({ pluginName: `meter-${i}` }))
    const body = modUpdatesPrBody({
      releases,
      reviews: releases.map(() => ({ kind: 'reviewed' as const, text: 'z'.repeat(7_900) })),
      notes: [],
    })

    expect(body.length).toBeLessThanOrEqual(MAX_BODY_CHARS)
    expect(body).toContain('… cut to fit the pull request: read the compare link')
    for (const r of releases) expect(body).toContain(`### ${r.entry.pluginName}`)
  })
})

describe('fenced', () => {
  it('uses a fence longer than any run of backticks inside, so the text cannot close it', () => {
    expect(fenced('a ```` b')).toBe('`````text\na ```` b\n`````')
    expect(fenced('plain')).toBe('```text\nplain\n```')
  })
})
