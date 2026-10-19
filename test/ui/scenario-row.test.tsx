// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AnsiSegment } from '@/render/types'
import { ScenarioRow } from '@/ui/scenario-row'

const SEGMENTS: AnsiSegment[] = [
  { text: 'Opus 4.8', fg: null, bg: null, bold: false, italic: false, underline: false },
]

describe('ScenarioRow', () => {
  it('renders the short label with the full title as a tooltip', () => {
    render(
      <ScenarioRow shortLabel="Clean repo" title="Clean repo, cheap session" segments={SEGMENTS} />,
    )
    const label = screen.getByText('Clean repo')
    expect(label.getAttribute('title')).toBe('Clean repo, cheap session')
  })

  it('renders the preview segments', () => {
    const { container } = render(
      <ScenarioRow shortLabel="Clean repo" title="Clean repo, cheap session" segments={SEGMENTS} />,
    )
    expect(container.querySelector('code')).not.toBeNull()
    expect(screen.getByText('Opus 4.8')).toBeTruthy()
  })

  it('uses the group-hover label treatment (fixed-width muted label that brightens on row hover)', () => {
    const { container } = render(
      <ScenarioRow shortLabel="Clean repo" title="Clean repo, cheap session" segments={SEGMENTS} />,
    )
    const row = container.firstChild as HTMLElement
    expect(row.className).toContain('group')
    const label = screen.getByText('Clean repo')
    expect(label.className).toContain('w-24')
    expect(label.className).toContain('shrink-0')
    expect(label.className).toContain('text-muted-foreground')
    expect(label.className).toContain('group-hover:text-foreground')
  })

  // A phone has no room for a label column: the label sits above the strip, beside it from sm up.
  it('stacks the label over the preview on a phone', () => {
    const { container } = render(
      <ScenarioRow shortLabel="Clean repo" title="Clean repo, cheap session" segments={SEGMENTS} />,
    )
    const row = container.firstChild as HTMLElement
    expect(row.className.split(' ')).toEqual(expect.arrayContaining(['flex-col', 'sm:flex-row']))
  })

  // Every row's strip runs to the same right edge, as in a gallery row, not the width of its text.
  it('lets the preview strip fill the rest of the row', () => {
    const { container } = render(
      <ScenarioRow shortLabel="Clean repo" title="Clean repo, cheap session" segments={SEGMENTS} />,
    )
    const row = container.firstChild as HTMLElement
    expect(row.className).not.toContain('items-start')
    const slot = row.lastElementChild as HTMLElement
    expect(slot.className.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'sm:flex-1']))
  })
})
