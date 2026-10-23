// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SideBySide } from '@/ui/side-by-side'

// Two things read together (a payload and its field list): the first, then the second.
describe('SideBySide', () => {
  it('shows the first, then the second', () => {
    render(<SideBySide first={<p>payload</p>} second={<p>fields</p>} />)

    const first = screen.getByText('payload')
    const second = screen.getByText('fields')
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
