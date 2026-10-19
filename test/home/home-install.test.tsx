// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { HomeInstall } from '@/home/home-install'

const section = () =>
  screen.getByRole('heading', { level: 2, name: 'How installing works' }).closest('section')

// A short strip of three steps, not the prototype's long walkthrough of panels.
describe('HomeInstall', () => {
  it('says why it is safe, then installing in three steps, in order', () => {
    render(<HomeInstall />)

    expect(section()?.textContent).toContain(
      'Every status line here was read by a person and rendered in a sandbox before it went up.',
    )
    const steps = within(section() as HTMLElement).getAllByRole('heading', { level: 3 })
    expect(steps.map((step) => step.textContent)).toEqual([
      'Copy its install prompt',
      'Paste it into Claude Code',
      'It runs under every prompt',
    ])
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
