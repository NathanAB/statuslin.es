// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/ui/checkbox'

describe('Checkbox', () => {
  it('calls onCheckedChange when toggled', () => {
    const onChange = vi.fn()
    render(<Checkbox id="x" checked={false} onCheckedChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
