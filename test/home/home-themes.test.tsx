// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishedTheme } from '@/themes/queries'

const recordModCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/functions', () => ({ recordModCopyFn }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
    }: {
      to: string
      params?: Record<string, string>
      children: ReactNode
    }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
  }
})

const { HomeThemes } = await import('@/home/home-themes')

const ORIGIN = 'https://statuslin.es'

function theme(name: string, slug: string): PublishedTheme {
  return {
    id: `${slug}-${name}`,
    key: `${slug}-${name}`,
    name,
    kind: 'terminal',
    window: 'dark',
    preview: [{ text: `${name} screen` }],
    usesTerminalColors: false,
    plugin: { id: `${slug}-id`, slug, title: `${slug} title`, authorGithub: 'octocat', code: null },
  }
}

const ROW = {
  themes: [theme('Night', 'pack'), theme('Mid', 'other'), theme('Dawn', 'pack')],
  total: 81,
}

beforeEach(() => {
  recordModCopyFn.mockReset().mockResolvedValue(1)
})

describe('the home themes row', () => {
  it('shows its themes, each with its install, and links to every theme on /themes', () => {
    render(<HomeThemes row={ROW} origin={ORIGIN} />)

    const row = screen.getByRole('region', { name: 'Claude Code themes' })
    expect(
      within(row)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Night', 'Mid', 'Dawn'])
    expect(
      within(row).getByRole('link', { name: 'Browse all 81 themes' }).getAttribute('href'),
    ).toBe('/themes')
    expect(
      within(row)
        .getAllByRole('button', { name: /^Copy install command for / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Copy install command for pack title',
      'Copy install command for other title',
      'Copy install command for pack title',
    ])
  })

  it('counts a copy from the row as an install of its plugin, from the home themes row', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<HomeThemes row={ROW} origin={ORIGIN} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy install command for other title' }))

    await waitFor(() => expect(recordModCopyFn).toHaveBeenCalledTimes(1))
    expect(recordModCopyFn).toHaveBeenCalledWith({
      data: {
        modId: 'other-id',
        kind: 'prompt',
        surface: 'home_themes',
        distinctId: 'did-test',
        sessionId: 'sid-test',
      },
    })
  })

  it('shows nothing when no theme is listed', () => {
    const { container } = render(<HomeThemes row={{ themes: [], total: 0 }} origin={ORIGIN} />)

    expect(container.innerHTML).toBe('')
  })
})
