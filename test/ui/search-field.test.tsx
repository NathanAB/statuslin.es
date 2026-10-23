// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchField } from '@/ui/search-field'

function renderField(value: string) {
  const onValueChange = vi.fn()
  render(
    <SearchField
      label="Search status lines and mods"
      placeholder="Search"
      action="/"
      name="q"
      params={{}}
      value={value}
      onValueChange={onValueChange}
    />,
  )
  return onValueChange
}

describe('SearchField', () => {
  // Chrome's own clear control is a blue cross off the palette; the field draws its own.
  it('offers its own clear button once there is text, which empties the search', () => {
    const onValueChange = renderField('git')

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(onValueChange).toHaveBeenCalledWith('')
    expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: 'Search status lines and mods' }),
    )
  })

  it('has no clear button while empty', () => {
    renderField('')

    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })
})
