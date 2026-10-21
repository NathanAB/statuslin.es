// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { Monitor } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { ChoiceGroup } from '@/ui/choice-group'

const OPTIONS = Array.from({ length: 8 }, (_, i) => ({ value: `line-${i}`, label: `Line ${i}` }))

// Tailwind's `duration-*` and `delay-*` time an element's transitions as well as its animation. On
// the hero picker's rows they held every pick back up to 735ms, then faded it over 900ms.
describe('ChoiceGroup rise', () => {
  it("times only the rows' entrance, never the fade a pick shows with", () => {
    render(
      <>
        <span id="label">Pick one</span>
        <ChoiceGroup
          look="list"
          rise
          labelledBy="label"
          options={OPTIONS}
          value="line-0"
          onValueChange={() => {}}
        />
      </>,
    )

    for (const radio of screen.getAllByRole('radio')) {
      const classes = radio.className.split(/\s+/).map((name) => name.replace(/^.*:/, ''))
      expect(classes.filter((name) => name.startsWith('delay-'))).toEqual([])
      expect(classes.filter((name) => name.startsWith('duration-'))).toEqual(['duration-150'])
    }
  })
})

describe('ChoiceGroup tray', () => {
  const renderTray = () =>
    render(
      <>
        <span id="label">Show it in</span>
        <ChoiceGroup
          look="tray"
          labelledBy="label"
          options={[
            { value: 'a', label: 'Terminal' },
            { value: 'b', label: 'Claude Desktop', icon: Monitor },
          ]}
          value="a"
          onValueChange={() => {}}
        />
      </>,
    )

  // An icon says at a glance what a choice is; it adds nothing to the choice's name.
  it("draws an option's icon before its label, hidden from screen readers", () => {
    renderTray()
    const desktop = screen.getByRole('radio', { name: 'Claude Desktop' })
    expect(desktop.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Terminal' }).querySelector('svg')).toBeNull()
  })
})
