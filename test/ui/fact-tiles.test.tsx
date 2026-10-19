// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { Globe, Sparkles } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { FactTiles } from '@/ui/fact-tiles'

const TILES = [
  { icon: Globe, label: 'Network', value: 'None' },
  {
    icon: Sparkles,
    label: 'Uses your plan',
    value: 'Asks the model for `/reflect`',
    caution: true,
  },
]

/** The term/definition pair a tile reads as. */
function tile(label: string) {
  const term = screen.getByText(label).closest('dt')
  const group = term?.parentElement
  if (!term || !group) throw new Error(`no tile labelled ${label}`)
  return { group, value: group.querySelector('dd')?.textContent }
}

describe('FactTiles', () => {
  it('pairs each label with its value as a description list', () => {
    const { container } = render(<FactTiles tiles={TILES} />)

    expect(container.querySelector('dl')).toBeTruthy()
    expect(tile('Network').value).toBe('None')
    expect(tile('Uses your plan').value).toBe('Asks the model for /reflect')
  })

  it('shows backtick-marked code in a value in monospace', () => {
    render(<FactTiles tiles={TILES} />)

    const code = within(tile('Uses your plan').group).getByText('/reflect')
    expect(code.className).toContain('font-mono')
  })

  it('draws a cost or risk in the warning tint and leaves the rest plain', () => {
    render(<FactTiles tiles={TILES} />)

    expect(tile('Uses your plan').group.dataset.tone).toBe('caution')
    expect(tile('Network').group.dataset.tone).toBe('plain')
  })

  // Tiles sit straight on the page as one surface each: no hairline around them.
  it('draws each tile as one borderless surface', () => {
    const { container } = render(<FactTiles tiles={TILES} />)
    for (const tile of container.querySelectorAll('dl > div')) {
      expect(tile.className).not.toMatch(/\bborder\b/)
    }
  })

  it('gives each tile a decorative icon', () => {
    const { container } = render(<FactTiles tiles={TILES} />)

    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true')
  })
})
