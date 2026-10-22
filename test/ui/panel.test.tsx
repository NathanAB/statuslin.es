// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel } from '@/ui/panel'

describe('Panel', () => {
  // Tiles in one grid row share a height, so links at each tile's foot line up across the row.
  it('stacks its foot one item per line at the bottom of the panel', () => {
    const { container } = render(
      <Panel foot={<a href="/a">A</a>}>
        <p>Body</p>
      </Panel>,
    )
    const foot = container.querySelector('[data-slot="panel-foot"]') as HTMLElement
    expect(foot.textContent).toBe('A')
    expect(foot.className).toContain('mt-auto')
    expect(foot.className).toContain('flex-col')
    expect(foot.className).toContain('items-start')
  })

  it('renders no foot when none is given', () => {
    const { container } = render(
      <Panel>
        <p>Body</p>
      </Panel>,
    )
    expect(container.querySelector('[data-slot="panel-foot"]')).toBeNull()
  })
})
