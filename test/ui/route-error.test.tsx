// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RouteError } from '@/ui/route-error'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RouteError', () => {
  it('offers a reload', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    const { container } = render(<RouteError error={new Error('chunk failed')} reset={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'This page couldn’t load' })).toBeTruthy()
    expect(container.querySelector('p')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })
})
