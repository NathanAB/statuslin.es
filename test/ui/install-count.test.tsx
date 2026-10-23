// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstallCount } from '@/ui/install-count'

describe('InstallCount', () => {
  it('uses the singular label for one install', () => {
    render(<InstallCount count={1} />)
    expect(screen.getByText('1 install')).toBeTruthy()
  })

  it('uses the plural label for zero or multiple installs', () => {
    const { rerender } = render(<InstallCount count={0} />)
    expect(screen.getByText('0 installs')).toBeTruthy()

    rerender(<InstallCount count={12} />)
    expect(screen.getByText('12 installs')).toBeTruthy()
  })
})
