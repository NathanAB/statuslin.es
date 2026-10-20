// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { KeyRound, UserCheck } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { InstallFacts } = await import('@/ui/install-facts')

// The facts a visitor needs before installing sit beside the install button, not pages below it.
describe('InstallFacts', () => {
  it('lists each fact under its heading, a risk in the caution tint, then a link', () => {
    render(
      <InstallFacts
        heading="Before you install"
        facts={[
          { icon: UserCheck, text: 'Reviewed before listing · this version, Oct 12, 2026' },
          { icon: KeyRound, text: 'Reads your Claude sign-in token', caution: true },
          { icon: UserCheck, text: 'Needs `jq` on your PATH' },
        ]}
        link={{
          label: 'Not showing after you paste? Fix it',
          to: '/guide/status-line-not-showing',
        }}
      />,
    )

    const panel = within(screen.getByRole('region', { name: 'Before you install' }))
    const items = panel.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Reviewed before listing · this version, Oct 12, 2026',
      'Reads your Claude sign-in token',
      'Needs jq on your PATH',
    ])
    expect(items.map((item) => item.getAttribute('data-tone'))).toEqual([
      'plain',
      'caution',
      'plain',
    ])
    expect(
      panel
        .getByRole('link', { name: /Not showing after you paste\? Fix it/ })
        .getAttribute('href'),
    ).toBe('/guide/status-line-not-showing')
  })
})
