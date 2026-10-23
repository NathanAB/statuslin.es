// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { Pin, Radar } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { IconList } from '@/ui/icon-list'

// The home page's four checks: each card names its step and says it in a line.
describe('IconList cards', () => {
  it('titles each card and puts its line under the title', () => {
    render(
      <IconList
        label="Checks"
        look="cards"
        items={[
          { icon: Pin, title: 'Pinned to one version', text: 'You install the version checked.' },
          { icon: Radar, title: 'Listed with what it can reach', text: 'Shown by the button.' },
        ]}
      />,
    )

    const cards = within(screen.getByRole('list', { name: 'Checks' })).getAllByRole('listitem')
    expect(
      cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(['Pinned to one version', 'Listed with what it can reach'])
    expect(
      within(cards[0] as HTMLElement).getByText('You install the version checked.'),
    ).toBeTruthy()
  })
})
