// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SelectField } from '@/ui/select'

const OPTIONS = [
  { value: 'bash', label: 'bash' },
  { value: 'node', label: 'node' },
  { value: 'python', label: 'python' },
]

describe('SelectField', () => {
  it('renders a select with the given options', () => {
    render(<SelectField id="interpreter" value="bash" onChange={vi.fn()} options={OPTIONS} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.value).toBe('bash')
    expect(select.options).toHaveLength(3)
    expect(select.options.item(0)?.value).toBe('bash')
    expect(select.options.item(1)?.value).toBe('node')
    expect(select.options.item(2)?.value).toBe('python')
  })

  it('connects to a label via id', () => {
    render(
      <>
        <label htmlFor="interp">Interpreter</label>
        <SelectField id="interp" value="node" onChange={vi.fn()} options={OPTIONS} />
      </>,
    )
    expect(screen.getByLabelText('Interpreter')).toBeTruthy()
  })

  it('carries the design-system classes verbatim from the original select', () => {
    const { container } = render(
      <SelectField id="interp" value="bash" onChange={vi.fn()} options={OPTIONS} />,
    )
    const select = container.querySelector('select') as HTMLElement
    expect(select.className).toContain('rounded-lg')
    expect(select.className).toContain('border')
    expect(select.className).toContain('border-input')
    expect(select.className).toContain('bg-field')
    expect(select.className).toContain('text-foreground')
    expect(select.className).toContain('focus-visible:border-ring')
  })

  it('calls onChange when the value changes', () => {
    const onChange = vi.fn()
    render(<SelectField id="interp" value="bash" onChange={onChange} options={OPTIONS} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    select.value = 'node'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onChange).toHaveBeenCalled()
  })
})
