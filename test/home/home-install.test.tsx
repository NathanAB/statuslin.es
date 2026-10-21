// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { HomeInstall } from '@/home/home-install'

const section = () =>
  screen.getByRole('heading', { level: 2, name: 'How installing works' }).closest('section')

// A short strip of three steps, not the prototype's long walkthrough of panels.
describe('HomeInstall', () => {
  // The page lists both kinds, so the steps say what happens to each: a status line's script, or
  // a mod installed from the marketplace at its reviewed commit.
  it('says why it is safe, then installing in three steps, for mods and status lines', () => {
    render(<HomeInstall />)

    const text = section()?.textContent ?? ''
    expect(text).toContain(
      'Every mod here, status lines included, was reviewed and rendered in a sandbox before it was listed.',
    )
    const steps = within(section() as HTMLElement).getAllByRole('heading', { level: 3 })
    expect(steps.map((step) => step.textContent)).toEqual([
      'Copy its install prompt',
      'Paste it into Claude Code',
      'It shows in your sessions',
    ])
    expect(text).toContain('saves the script in ~/.claude')
    expect(text).toMatch(/adds the statuslin\.es marketplace and installs the mod/)
  })

  it('has no long panels: no code, no prompt, no terminal', () => {
    render(<HomeInstall />)

    expect(section()?.querySelector('pre, code, [role="img"]')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(<HomeInstall />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
