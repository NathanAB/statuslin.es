// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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
