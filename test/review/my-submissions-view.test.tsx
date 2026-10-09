import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MySubmissionRow, UpdateSummary } from '@/review/my-submissions'

vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn() } }))
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    const path = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to
    const query = search ? `?${new URLSearchParams(search).toString()}` : ''
    return <a href={`${path}${query}`}>{children}</a>
  },
}))

const { MySubmissionsView } = await import('@/review/dashboard-views')

const USER = { name: 'Owner', username: 'owner', image: null, role: null }

function row(over: {
  configStatus: string
  versionStatus: string
  update?: UpdateSummary | null
}): MySubmissionRow {
  return {
    config: {
      id: 'c1',
      slug: 'my-line',
      status: over.configStatus,
      authorId: 'owner',
      author: { name: 'Owner', username: 'owner', image: null },
      upvoteCount: 0,
      copyCount: 0,
      createdAt: new Date('2026-06-13T12:00:00Z'),
    },
    version: {
      id: 'v1',
      versionNumber: 1,
      title: 'My line',
      description: '',
      interpreter: 'bash',
      source: 'echo hi',
      contentSha256: 'abc123',
      status: over.versionStatus,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      networkHosts: [],
      readsClaudeToken: false,
      rejectionReason: null,
    },
    renderJob: {
      status: 'done',
      attempts: 1,
      error: null,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      finishedAt: new Date('2026-06-13T12:01:00Z'),
    },
    previews: [],
    update: over.update ?? null,
  }
}

const html = (r: MySubmissionRow) =>
  renderToStaticMarkup(<MySubmissionsView rows={[r]} user={USER} />)
const UPDATE_LINK = 'href="/submit?update=my-line"'

describe('MySubmissionsView update state', () => {
  it.each([
    ['queued', 'Update v2 queued to render'],
    ['running', 'Update v2 rendering'],
    ['failed', 'Update v2 failed to render'],
    ['done', 'Update v2 in review'],
    ['held', 'Update v2 in review'],
  ])('keeps a published card linked and shows a %s update', (renderStatus, line) => {
    const markup = html(
      row({
        configStatus: 'published',
        versionStatus: 'approved',
        update: { versionNumber: 2, status: 'pending', renderStatus },
      }),
    )
    expect(markup).toContain('href="/c/my-line"')
    expect(markup).toContain('published')
    expect(markup).toContain(line)
  })

  it('shows no update line for an update that is no longer pending', () => {
    const markup = html(
      row({
        configStatus: 'published',
        versionStatus: 'approved',
        update: { versionNumber: 2, status: 'rejected', renderStatus: 'done' },
      }),
    )
    expect(markup).not.toContain('Update v2')
    expect(markup).toContain(UPDATE_LINK)
  })

  it('offers Submit update only on a published config', () => {
    expect(html(row({ configStatus: 'published', versionStatus: 'approved' }))).toContain(
      UPDATE_LINK,
    )
    expect(html(row({ configStatus: 'draft', versionStatus: 'pending' }))).not.toContain(
      'Submit update',
    )
    expect(html(row({ configStatus: 'removed', versionStatus: 'approved' }))).not.toContain(
      'Submit update',
    )
  })

  it('keeps Fix and resubmit for a rejected draft', () => {
    const markup = html(row({ configStatus: 'draft', versionStatus: 'rejected' }))
    expect(markup).toContain('href="/submit?resubmit=my-line"')
    expect(markup).not.toContain('Submit update')
  })
})
