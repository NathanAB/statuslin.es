// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CustomizeScreen } from '@/ui/customize-screen'

const lit = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-part][data-lit]')].map((el) => el.getAttribute('data-part'))

// One Claude Code session where every way to customize it has its place; the pick is lit.
describe('CustomizeScreen', () => {
  it('is one picture to a screen reader, named by its label', () => {
    render(<CustomizeScreen focus="mods" label="Where a mod draws: the band above the prompt" />)
    expect(screen.getByRole('img', { name: 'Where a mod draws: the band above the prompt' }))
  })

  it('lights only the part the pick changes', () => {
    const { container } = render(<CustomizeScreen focus="status-line" label="x" />)
    expect(lit(container)).toEqual(['status-line'])
  })

  it('has a place for every part but themes, which recolors the whole screen', () => {
    const { container } = render(<CustomizeScreen focus="mods" label="x" />)
    expect(
      [
        ...new Set(
          [...container.querySelectorAll('[data-part]')].map((el) => el.getAttribute('data-part')),
        ),
      ].sort(),
    ).toEqual(
      [
        'hooks',
        'mods',
        'output-styles',
        'skills',
        'spinner-verbs',
        'status-line',
        'subagents',
      ].sort(),
    )
    const themed = render(<CustomizeScreen focus="themes" label="y" />).container
    expect(themed.querySelector('[role="img"]')?.getAttribute('data-look')).toBe('light')
    expect(lit(themed)).toEqual([])
    expect(container.querySelector('[role="img"]')?.getAttribute('data-look')).toBe('dark')
  })

  // The spinner's words are the setting, so picking them shows your own.
  it('swaps the spinner word when spinner verbs are picked', () => {
    const { container: before } = render(<CustomizeScreen focus="mods" label="a" />)
    const { container: after } = render(<CustomizeScreen focus="spinner-verbs" label="b" />)
    const spinner = (c: HTMLElement) => c.querySelector('[data-part="spinner-verbs"]')?.textContent
    expect(spinner(before)).toMatch(/Cooking/)
    expect(spinner(after)).toMatch(/Reticulating/)
  })
})
