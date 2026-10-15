// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/gallery/ranked-card-list', () => ({ RankedCardList: () => null }))
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a> }
})

const { Route: BestRoute } = await import('@/routes/status-lines.best')

const loaderData = (latestCopy: string | null, count = 0) => ({
  user: null,
  page: { items: Array.from({ length: count }, () => ({})), latestCopy },
})

async function titleFor(latestCopy: string | null) {
  const head = await BestRoute.options.head?.({ loaderData: loaderData(latestCopy) } as never)
  return head?.meta?.find((tag) => tag && 'title' in tag)
}

describe('/status-lines/best', () => {
  it('dates the title and H1 with the month and year of the newest copy', async () => {
    expect(await titleFor('2026-10-14')).toEqual({
      title: 'Best Claude Code Status Lines (October 2026) | statuslin.es',
    })

    vi.spyOn(BestRoute, 'useLoaderData').mockReturnValue(loaderData('2026-10-14'))
    const BestPage = BestRoute.options.component
    render(BestPage ? <BestPage /> : null)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Best Claude Code status lines (October 2026)',
      }),
    ).toBeTruthy()
    expect(screen.getByText(/as of 2026-10-14/)).toBeTruthy()
  })

  it('reads the month in UTC, so a first-of-month copy never shows the previous month', async () => {
    expect(await titleFor('2026-11-01')).toEqual({
      title: 'Best Claude Code Status Lines (November 2026) | statuslin.es',
    })
  })

  it('drops the brand in the one month whose title would pass 60 characters', async () => {
    expect(await titleFor('2026-09-30')).toEqual({
      title: 'Best Claude Code Status Lines (September 2026)',
    })
  })

  it('counts the ranked status lines in the intro, singular for one', () => {
    vi.spyOn(BestRoute, 'useLoaderData').mockReturnValue(loaderData(null, 1))
    const BestPage = BestRoute.options.component
    const { unmount } = render(BestPage ? <BestPage /> : null)
    expect(screen.getByText(/^The most-copied status line on statuslin\.es\./)).toBeTruthy()
    unmount()

    vi.spyOn(BestRoute, 'useLoaderData').mockReturnValue(loaderData(null, 10))
    render(BestPage ? <BestPage /> : null)
    expect(screen.getByText(/^The 10 most-copied status lines on statuslin\.es\./)).toBeTruthy()
  })

  it('leaves the date out before anything has been copied', async () => {
    expect(await titleFor(null)).toEqual({ title: 'Best Claude Code Status Lines | statuslin.es' })
  })
})
