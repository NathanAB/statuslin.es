// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShowAllList } from '@/ui/show-all-list'

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => `Row ${i + 1}`).map((name) => (
    <a key={name} href={`/c/${name}`}>
      {name}
    </a>
  ))

const collapsed = (name: string) => screen.getByText(name).closest('[hidden]') !== null

describe('ShowAllList', () => {
  it('shows the first rows and keeps the rest in the page, collapsed behind Show all', () => {
    render(<ShowAllList shown={12}>{rows(15)}</ShowAllList>)

    expect(collapsed('Row 1')).toBe(false)
    expect(collapsed('Row 12')).toBe(false)
    expect(collapsed('Row 13')).toBe(true)
    expect(collapsed('Row 15')).toBe(true)
    const button = screen.getByRole('button', { name: 'Show all 15' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const controlled = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(controlled?.contains(screen.getByText('Row 13'))).toBe(true)
  })

  it('reveals the rest on click and moves focus to the first row it showed', () => {
    render(<ShowAllList shown={12}>{rows(15)}</ShowAllList>)

    fireEvent.click(screen.getByRole('button', { name: 'Show all 15' }))

    expect(collapsed('Row 13')).toBe(false)
    expect(collapsed('Row 15')).toBe(false)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.activeElement).toBe(screen.getByText('Row 13'))
  })

  it('has no button when every row fits', () => {
    render(<ShowAllList shown={12}>{rows(12)}</ShowAllList>)

    expect(collapsed('Row 12')).toBe(false)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
