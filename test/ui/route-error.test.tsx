// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RouteError } from '@/ui/route-error'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RouteError', () => {
  it('offers a reload and keeps the failed page out of search results', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    render(<RouteError error={new Error('chunk failed')} reset={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'This page couldn’t load' })).toBeTruthy()
    expect(
      screen.getByText('A required file failed to load. Reload the page to try again.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))

    expect(reload).toHaveBeenCalledOnce()
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, follow',
    )
  })
})
