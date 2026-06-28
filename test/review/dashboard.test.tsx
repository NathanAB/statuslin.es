import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardRow } from '@/review/queue'

// The card uses useRouter() to invalidate after an action; stub it so static rendering works.
// Link needs a router context too — stub it to a plain anchor that resolves `to`/`params`.
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const { SubmissionCard, StatusSummary } = await import('@/review/dashboard-card')

function row(over: {
  status: string
  error?: string | null
  withPreview?: boolean
  versionStatus?: string
  networkHosts?: string[]
}): DashboardRow {
  return {
    config: {
      id: 'c1',
      slug: 'my-line',
      title: 'My line',
      description: '',
      interpreter: 'bash',
      status: 'draft',
      authorId: 'u1',
      author: { name: 'Test User', username: 'test', image: null },
      upvoteCount: 0,
      copyCount: 0,
      createdAt: new Date('2026-06-13T12:00:00Z'),
    },
    version: {
      id: 'v1',
      versionNumber: 1,
      source: '#!/bin/bash\necho hi',
      contentSha256: 'abc123def456',
      status: over.versionStatus ?? 'pending',
      createdAt: new Date('2026-06-13T12:00:00Z'),
      networkHosts: over.networkHosts ?? [],
    },
    renderJob: {
      status: over.status,
      attempts: over.status === 'failed' ? 2 : 0,
      error: over.error ?? null,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      finishedAt: over.status === 'done' ? new Date('2026-06-13T12:01:00Z') : null,
    },
    previews: over.withPreview
      ? [
          {
            scenarioKey: 'clean-main',
            segments: [
              { text: 'hi', fg: null, bg: null, bold: false, italic: false, underline: false },
            ],
            rawStdout: 'hi',
            exitCode: 0,
            timedOut: false,
            trace: { commands: [], network: [], files: [] } as never,
          },
        ]
      : [],
  }
}

describe('SubmissionCard', () => {
  it('shows the error and a Re-queue button on a failed row, no Approve', () => {
    const html = renderToStaticMarkup(
      <SubmissionCard row={row({ status: 'failed', error: 'sandbox exploded' })} />,
    )
    expect(html).toContain('sandbox exploded')
    expect(html).toContain('Re-queue')
    expect(html).not.toContain('Approve')
  })

  it('shows Approve/Reject and the preview on a ready (done) row, no Re-queue', () => {
    const html = renderToStaticMarkup(
      <SubmissionCard row={row({ status: 'done', withPreview: true })} />,
    )
    expect(html).toContain('Approve')
    expect(html).toContain('Reject')
    expect(html).not.toContain('Re-queue')
  })

  it('shows every rendered scenario in the Render output disclosure', () => {
    const seg = (text: string) => ({
      text,
      fg: null,
      bg: null,
      bold: false,
      italic: false,
      underline: false,
    })
    const r = row({ status: 'done', withPreview: true })
    r.previews = [
      // Out of canonical order on purpose — the disclosure should sort + label them.
      {
        scenarioKey: 'dirty-feature',
        segments: [seg('dirty')],
        rawStdout: 'dirty',
        exitCode: 0,
        timedOut: false,
        trace: { commands: [], network: [], files: [] } as never,
      },
      {
        scenarioKey: 'clean-main',
        segments: [seg('clean')],
        rawStdout: 'clean',
        exitCode: 0,
        timedOut: false,
        trace: { commands: [], network: [], files: [] } as never,
      },
    ]
    const html = renderToStaticMarkup(<SubmissionCard row={r} />)
    // Both scenarios' labels are present (not just clean-main).
    expect(html).toContain('Clean repo')
    expect(html).toContain('Dirty branch')
  })

  it('flags a non-zero / timed-out scenario in the disclosure', () => {
    const seg = (text: string) => ({
      text,
      fg: null,
      bg: null,
      bold: false,
      italic: false,
      underline: false,
    })
    const r = row({ status: 'done', withPreview: true })
    r.previews = [
      {
        scenarioKey: 'clean-main',
        segments: [seg('ok')],
        rawStdout: 'ok',
        exitCode: 0,
        timedOut: false,
        trace: { commands: [], network: [], files: [] } as never,
      },
      {
        scenarioKey: 'dirty-feature',
        segments: [seg('')],
        rawStdout: '',
        exitCode: 1,
        timedOut: false,
        trace: { commands: [], network: [], files: [] } as never,
      },
    ]
    const html = renderToStaticMarkup(<SubmissionCard row={r} />)
    expect(html).toContain('exit 1')
  })

  it('offers Re-queue on a still-queued row', () => {
    const html = renderToStaticMarkup(<SubmissionCard row={row({ status: 'queued' })} />)
    expect(html).toContain('Re-queue')
    expect(html).not.toContain('Approve')
  })

  it('renders no action buttons when showActions is false (the /me view)', () => {
    const ready = renderToStaticMarkup(
      <SubmissionCard row={row({ status: 'done', withPreview: true })} showActions={false} />,
    )
    expect(ready).not.toContain('Approve')
    expect(ready).not.toContain('Reject')
    const queued = renderToStaticMarkup(
      <SubmissionCard row={row({ status: 'queued' })} showActions={false} />,
    )
    expect(queued).not.toContain('Re-queue')
  })

  it('links the card to its detail page and drops the disclosures when detailSlug is set', () => {
    const html = renderToStaticMarkup(
      <SubmissionCard
        row={row({ status: 'done', withPreview: true, versionStatus: 'approved' })}
        statusMode="review"
        showActions={false}
        detailSlug="my-line"
      />,
    )
    expect(html).toContain('href="/c/my-line"')
    // The stretched-link overlay would cover them, and the detail page already has them.
    expect(html).not.toContain('Source')
    expect(html).not.toContain('Render output')
  })

  it('shows declared hosts and a Run network preview button for a held network version', () => {
    const html = renderToStaticMarkup(
      <SubmissionCard row={row({ status: 'held', networkHosts: ['wttr.in', '*.espn.com'] })} />,
    )
    expect(html).toContain('wttr.in')
    expect(html).toContain('*.espn.com')
    expect(html).toMatch(/run network preview/i)
  })

  it('review mode labels by review outcome, not render step', () => {
    // Approved+rendered: published, never "ready"/"ready to review".
    const published = renderToStaticMarkup(
      <SubmissionCard
        row={row({ status: 'done', withPreview: true, versionStatus: 'approved' })}
        statusMode="review"
        showActions={false}
      />,
    )
    expect(published).toContain('published')
    expect(published).not.toContain('ready to review')

    // Rejected.
    const rejected = renderToStaticMarkup(
      <SubmissionCard
        row={row({ status: 'done', versionStatus: 'rejected' })}
        statusMode="review"
        showActions={false}
      />,
    )
    expect(rejected).toContain('rejected')

    // Pending + rendered: waiting for a reviewer, not "ready to review".
    const inReview = renderToStaticMarkup(
      <SubmissionCard
        row={row({ status: 'done', versionStatus: 'pending' })}
        statusMode="review"
        showActions={false}
      />,
    )
    expect(inReview).toContain('in review')
    expect(inReview).not.toContain('ready to review')
  })
})

describe('StatusSummary', () => {
  it('counts rows by render status', () => {
    const rows = [
      row({ status: 'failed', error: 'x' }),
      row({ status: 'failed', error: 'y' }),
      row({ status: 'queued' }),
      row({ status: 'done', withPreview: true }),
    ]
    const html = renderToStaticMarkup(<StatusSummary rows={rows} />)
    expect(html).toContain('2 failed')
    expect(html).toContain('1 queued')
    expect(html).toContain('1 ready')
  })

  it('counts held network jobs', () => {
    const rows = [row({ status: 'held', networkHosts: ['wttr.in'] }), row({ status: 'queued' })]
    const html = renderToStaticMarkup(<StatusSummary rows={rows} />)
    expect(html).toContain('1 needs network review')
    expect(html).toContain('1 queued')
  })
})
