// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveVersion } from '@/review/live-version'
import type { DashboardRow } from '@/review/queue'

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const { SubmissionCard } = await import('@/review/dashboard-card')

afterEach(cleanup)

const liveVersion: LiveVersion = {
  title: 'Live line',
  description: 'Shows the branch',
  interpreter: 'bash',
  source: 'echo live\necho same',
  networkHosts: ['api.example.com'],
}

function row(
  version: Partial<DashboardRow['version']> = {},
  live: LiveVersion | null = liveVersion,
): DashboardRow {
  return {
    config: {
      id: 'c1',
      slug: 'my-line',
      status: 'published',
      authorId: 'u1',
      author: { name: 'Test User', username: 'test', image: null },
      upvoteCount: 0,
      copyCount: 0,
      createdAt: new Date('2026-06-13T12:00:00Z'),
    },
    version: {
      id: 'v2',
      versionNumber: 2,
      title: liveVersion.title,
      description: liveVersion.description,
      interpreter: liveVersion.interpreter,
      source: liveVersion.source,
      contentSha256: 'abc123',
      status: 'pending',
      createdAt: new Date('2026-06-13T12:00:00Z'),
      networkHosts: liveVersion.networkHosts,
      readsClaudeToken: false,
      rejectionReason: null,
      rejectionEmailStatus: null,
      ...version,
    },
    renderJob: {
      status: 'done',
      attempts: 0,
      error: null,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      finishedAt: new Date('2026-06-13T12:01:00Z'),
    },
    previews: [],
    ...(live ? { live } : {}),
  }
}

describe('admin review card for an update', () => {
  it('is labeled with the slug it updates; a first submission is not', () => {
    render(<SubmissionCard row={row({ title: 'New title' })} />)
    expect(screen.getByText('Update to my-line')).toBeTruthy()
    cleanup()

    render(<SubmissionCard row={row({ networkHosts: ['api.example.com'] }, null)} />)
    expect(screen.queryByText(/Update to/)).toBeNull()
    expect(screen.queryByText('Adds network access')).toBeNull()
    expect(screen.queryByRole('deletion')).toBeNull()
  })

  it('shows the script as a line diff against the live version', () => {
    render(<SubmissionCard row={row({ source: 'echo updated\necho same' })} />)

    const removed = screen.getAllByRole('deletion').map((line) => line.textContent)
    const added = screen.getAllByRole('insertion').map((line) => line.textContent)
    expect(removed).toEqual([expect.stringContaining('echo live')])
    expect(added).toEqual([expect.stringContaining('echo updated')])
    expect(screen.getByText(/echo same/, { selector: 'pre span' })).toBeTruthy()
  })

  it('says the script is unchanged when only the listing text changed', () => {
    render(<SubmissionCard row={row({ description: 'Shows the branch and model' })} />)

    expect(screen.getByText('Script unchanged')).toBeTruthy()
    expect(screen.queryByRole('insertion')).toBeNull()
  })

  it('shows before and after only for the listing fields that changed', () => {
    render(<SubmissionCard row={row({ title: 'New title', interpreter: 'python' })} />)

    const title = screen.getByRole('row', { name: /^Title/ })
    expect(title.textContent).toContain('Live line')
    expect(title.textContent).toContain('New title')
    const interpreter = screen.getByRole('row', { name: /^Interpreter/ })
    expect(interpreter.textContent).toContain('bash')
    expect(interpreter.textContent).toContain('python')
    expect(screen.queryByRole('row', { name: /^Description/ })).toBeNull()
  })

  it('shows no before and after when no listing field changed', () => {
    render(<SubmissionCard row={row({ source: 'echo updated' })} />)

    expect(screen.queryByRole('table')).toBeNull()
  })

  it('highlights only the network hosts the update adds', () => {
    render(<SubmissionCard row={row({ networkHosts: ['api.example.com', 'new.example.com'] })} />)

    expect(screen.getByText('Adds network access')).toBeTruthy()
    // The full declared list shows both; the highlight repeats only the added host.
    expect(screen.getAllByText('new.example.com')).toHaveLength(2)
    expect(screen.getAllByText('api.example.com')).toHaveLength(1)
  })

  it('does not highlight network hosts when the update adds none', () => {
    render(<SubmissionCard row={row({ networkHosts: [], source: 'echo offline' })} />)

    expect(screen.queryByText('Adds network access')).toBeNull()
  })
})
