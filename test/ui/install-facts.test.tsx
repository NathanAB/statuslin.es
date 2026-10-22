// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
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
    const { container } = render(
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
    // Given only facts (a status line page), nothing folds.
    expect(container.querySelector('details')).toBeNull()
  })

  // A long list reads as too much at once: what can wait folds under a count, closed until opened.
  it('folds `more`, then `notes`, each under its summary, closed until opened', () => {
    const { container } = render(
      <InstallFacts
        heading="What this mod can do"
        facts={[{ icon: UserCheck, text: 'Reviewed at commit `a5c8ead`' }]}
        more={{
          summary: '1 more thing it can do',
          facts: [{ icon: KeyRound, text: 'Reads files' }],
        }}
        notes={{ summary: 'Good to know (1)', facts: [{ icon: UserCheck, text: 'Needs `jq`' }] }}
        link={{ label: 'Are mods safe?', to: '/guide/are-claude-code-mods-safe' }}
      />,
    )

    const folds = () =>
      [...container.querySelectorAll('details')].map((fold) => [
        fold.querySelector('summary')?.textContent,
        fold.open,
        [...fold.querySelectorAll('li')].map((li) => li.textContent),
      ])
    expect(folds()).toEqual([
      ['1 more thing it can do', false, ['Reads files']],
      ['Good to know (1)', false, ['Needs jq']],
    ])
    fireEvent.click(screen.getByText('Good to know (1)'))
    expect(folds().map(([summary, open]) => [summary, open])).toEqual([
      ['1 more thing it can do', false],
      ['Good to know (1)', true],
    ])
  })
})
