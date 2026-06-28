// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Box, Row, Stack } from '@/ui/layout'

describe('Stack', () => {
  it('is a flex-col container', () => {
    const { container } = render(<Stack gap={4}>x</Stack>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('flex')
    expect(el.className).toContain('flex-col')
  })

  it('allows truncating children when minW0 is set', () => {
    const { container } = render(
      <Stack gap={1} minW0>
        x
      </Stack>,
    )
    const el = container.firstChild as HTMLElement
    expect(el.className.split(/\s+/)).toContain('min-w-0')
  })

  it('maps each gap value to a complete literal class', () => {
    const cases: [1 | 1.5 | 2 | 3 | 4 | 6, string][] = [
      [1, 'gap-y-1'],
      [1.5, 'gap-y-1.5'],
      [2, 'gap-y-2'],
      [3, 'gap-y-3'],
      [4, 'gap-y-4'],
      [6, 'gap-y-6'],
    ]
    for (const [gap, cls] of cases) {
      const { container } = render(<Stack gap={gap}>x</Stack>)
      const el = container.firstChild as HTMLElement
      expect(el.className.split(/\s+/)).toContain(cls)
    }
  })
})

describe('Row', () => {
  it('is a flex row, centered by default', () => {
    const { container } = render(<Row gap={3}>x</Row>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('flex')
    expect(el.className).not.toContain('flex-col')
    expect(el.className).toContain('items-center')
  })

  it('maps gap to a complete literal class', () => {
    const { container } = render(<Row gap={3}>x</Row>)
    const el = container.firstChild as HTMLElement
    expect(el.className.split(/\s+/)).toContain('gap-x-3')
  })

  it('aligns to start when align="start"', () => {
    const { container } = render(
      <Row gap={2} align="start">
        x
      </Row>,
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('items-start')
  })

  it('justifies between when justify="between"', () => {
    const { container } = render(
      <Row gap={2} justify="between">
        x
      </Row>,
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('justify-between')
  })

  it('wraps when wrap is set', () => {
    const { container } = render(
      <Row gap={3} wrap>
        x
      </Row>,
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('flex-wrap')
  })

  it('stacks above a card overlay when aboveOverlay is set', () => {
    const { container } = render(
      <Row gap={3} aboveOverlay>
        x
      </Row>,
    )
    const el = container.firstChild as HTMLElement
    for (const cls of ['relative', 'z-10', 'shrink-0']) {
      expect(el.className.split(/\s+/)).toContain(cls)
    }
  })
})

describe('Box', () => {
  it('renders the UNSAFE_className verbatim on a div', () => {
    // REASON: test fixture verifying Box passes UNSAFE_className through to the DOM
    const { container } = render(<Box UNSAFE_className="relative z-10 mt-2">x</Box>)
    const el = container.firstChild as HTMLElement
    expect(el.tagName).toBe('DIV')
    expect(el.className).toContain('relative')
    expect(el.className).toContain('z-10')
    expect(el.className).toContain('mt-2')
  })
})
