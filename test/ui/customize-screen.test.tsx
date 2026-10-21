// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CustomizeScreen } from '@/ui/customize-screen'

const lit = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-part][data-lit]')].map((el) => el.getAttribute('data-part'))

// One Claude Code session where every way to customize it has its place; the pick is lit.
describe('CustomizeScreen', () => {
  it('is one picture to a screen reader, named by its label', () => {
    render(
      <CustomizeScreen
        focus="mods"
        label="Where a mod draws: the band above the prompt"
        caption="c"
      />,
    )
    expect(screen.getByRole('img', { name: 'Where a mod draws: the band above the prompt' }))
  })

  it('lights only the part the pick changes', () => {
    const { container } = render(<CustomizeScreen focus="status-line" label="x" caption="c" />)
    expect(lit(container)).toEqual(['status-line'])
  })

  it('has a place for every part but themes, which recolors the whole screen', () => {
    const { container } = render(<CustomizeScreen focus="mods" label="x" caption="c" />)
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
    const themed = render(<CustomizeScreen focus="themes" label="y" caption="c" />).container
    expect(themed.querySelector('[role="img"]')?.getAttribute('data-look')).toBe('light')
    expect(lit(themed)).toEqual([])
    expect(container.querySelector('[role="img"]')?.getAttribute('data-look')).toBe('dark')
  })

  // The spinner's words are the setting, so picking them shows your own.
  it('swaps the spinner word when spinner verbs are picked', () => {
    const { container: before } = render(<CustomizeScreen focus="mods" label="a" caption="c" />)
    const { container: after } = render(
      <CustomizeScreen focus="spinner-verbs" label="b" caption="c" />,
    )
    const spinner = (c: HTMLElement) => c.querySelector('[data-part="spinner-verbs"]')?.textContent
    expect(spinner(before)).toMatch(/Cooking/)
    expect(spinner(after)).toMatch(/Reticulating/)
  })

  // Drawn from Claude Code's docs: the Task tool is Agent since 2.1.63, a hook surfaces as its
  // error notice, and a custom status line hides the footer's "esc to interrupt" hint.
  it('draws rows Claude Code really shows', () => {
    const { container } = render(<CustomizeScreen focus="mods" label="x" caption="c" />)
    const part = (name: string) => container.querySelector(`[data-part="${name}"]`)?.textContent
    expect(part('subagents')).toMatch(/^● Agent\(/)
    expect(part('hooks')).toMatch(/PreToolUse:Bash hook error/)
    expect(container.textContent).not.toMatch(/esc to interrupt|hook: allowed|Task\(/)
  })

  // The pane and the band are example mods, not part of Claude Code; the caption says so.
  it('says under the screen what is an example', () => {
    render(<CustomizeScreen focus="mods" label="x" caption="The pane and band are example mods." />)
    expect(screen.getByText('The pane and band are example mods.')).toBeTruthy()
  })
})
