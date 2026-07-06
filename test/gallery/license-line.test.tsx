// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LicenseLine } from '@/gallery/license-line'

describe('LicenseLine', () => {
  it('renders nothing when there is no license', () => {
    const { container } = render(<LicenseLine license={null} sourceUrl={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the license and a link to the source when both are present', () => {
    render(<LicenseLine license="MIT" sourceUrl="https://example.com/x" />)
    expect(screen.getByText(/MIT licensed/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /original source/i })
    expect(link.getAttribute('href')).toBe('https://example.com/x')
  })

  it('renders the license without a source link when sourceUrl is absent', () => {
    render(<LicenseLine license="MIT" sourceUrl={null} />)
    expect(screen.getByText(/MIT licensed/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /original source/i })).toBeNull()
  })
})
