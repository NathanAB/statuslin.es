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
})
