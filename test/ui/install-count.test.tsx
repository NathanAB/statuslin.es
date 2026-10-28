// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstallCount, installsLabel } from '@/ui/install-count'

describe('InstallCount', () => {
  it('shows the count from three installs up', () => {
    const { rerender } = render(<InstallCount count={3} />)
    expect(screen.getByText('3 installs')).toBeTruthy()

    rerender(<InstallCount count={12} />)
    expect(screen.getByText('12 installs')).toBeTruthy()
  })

  it('shows nothing below three installs', () => {
    const { container } = render(<InstallCount count={2} />)
    expect(container.textContent).toBe('')
  })
})

describe('installsLabel', () => {
  it('has no label below three installs', () => {
    expect([0, 1, 2].map(installsLabel)).toEqual([null, null, null])
    expect(installsLabel(3)).toBe('3 installs')
  })
})
