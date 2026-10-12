import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MyModRow } from '@/review/my-submissions'

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
const USER = { name: 'Ada', username: 'ada', image: null, role: null }

type RowOverrides = Partial<Omit<MyModRow, 'latest'>> & { latest?: Partial<MyModRow['latest']> }

function row({ latest, ...over }: RowOverrides = {}): MyModRow {
  return {
    mod: { id: 'm1', slug: 'meter', title: 'Context meter', status: 'draft' },
    liveVersionNumber: null,
    ...over,
    latest: { versionNumber: 1, status: 'pending', rejectionReason: null, ...latest },
  }
}

const html = (mods: MyModRow[]) =>
  renderToStaticMarkup(<MySubmissionsView rows={[]} mods={mods} user={USER} />)

describe('a submitted mod on /me', () => {
  it('shows a mod in review', () => {
    const markup = html([row()])
    expect(markup).toContain('Context meter')
    expect(markup).toContain('Waiting for a reviewer')
  })

  it('links a rejected first submission to fix and resubmit, with the reason', () => {
    const markup = html([row({ latest: { status: 'rejected', rejectionReason: 'No hooks' } })])
    expect(markup).toContain('Not accepted')
    expect(markup).toContain('No hooks')
    expect(markup).toContain('href="/submit?kind=mod&amp;resubmit=meter"')
  })

  it('links a published mod to its page and to an update, noting an update in review', () => {
    const markup = html([
      row({
        mod: { id: 'm1', slug: 'meter', title: 'Context meter', status: 'published' },
        liveVersionNumber: 1,
        latest: { versionNumber: 2 },
      }),
    ])
    expect(markup).toContain('href="/mods/meter"')
    expect(markup).toContain('href="/submit?kind=mod&amp;update=meter"')
    expect(markup).toContain('Update v2 in review')
  })

  it('offers no fix for a removed mod, which cannot be resubmitted', () => {
    const markup = html([
      row({
        mod: { id: 'm1', slug: 'meter', title: 'Context meter', status: 'removed' },
        latest: { status: 'rejected', rejectionReason: 'No' },
      }),
    ])
    expect(markup).toContain('removed')
    expect(markup).not.toContain('resubmit=meter')
  })

  it('says it has nothing only when there are no status lines and no mods', () => {
    expect(html([])).toContain('submitted anything yet.')
    expect(html([row()])).not.toContain('submitted anything yet.')
  })
})
