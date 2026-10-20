// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StepList } from '@/ui/step-list'

const STEPS = [
  { id: 'save-it', title: 'Save it', content: <pre>cat &gt; file</pre> },
  { id: 'run-it', title: 'Run it', content: <pre>./file</pre> },
]

// Steps a person follows in order: each one numbered, titled, with its own code under it.
describe('StepList', () => {
  it('numbers each step in order, its title an h3 and its content under it', () => {
    render(<StepList label="Steps" steps={STEPS} />)

    const items = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem')
    expect(
      items.map((item) => within(item).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(['Save it', 'Run it'])
    expect(items[0]?.textContent).toMatch(/^1/)
    expect(items[1]?.textContent).toMatch(/^2/)
    expect(items[1] && within(items[1]).getByText('./file')).toBeTruthy()
  })

  it('gives each step its id, so a link can land on it', () => {
    const { container } = render(<StepList label="Steps" steps={STEPS} />)

    const step = container.querySelector('#run-it')
    expect(
      step && within(step as HTMLElement).getByRole('heading', { name: 'Run it' }),
    ).toBeTruthy()
  })
})
