// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopyCount } from '@/ui/copy-count'

describe('CopyCount', () => {
  it('uses the singular label for one copy', () => {
    render(<CopyCount count={1} />)
    expect(screen.getByText('1 copy')).toBeTruthy()
  })

  it('uses the plural label for zero or multiple copies', () => {
    const { rerender } = render(<CopyCount count={0} />)
    expect(screen.getByText('0 copies')).toBeTruthy()

    rerender(<CopyCount count={12} />)
    expect(screen.getByText('12 copies')).toBeTruthy()
  })
})
