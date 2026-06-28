// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NetworkSection } from '@/submit/network-section'

type Props = React.ComponentProps<typeof NetworkSection>

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    enabled: false,
    hosts: [],
    onEnabledChange: vi.fn(),
    onAddHost: vi.fn(),
    onRemoveHost: vi.fn(),
    ...over,
  }
  render(<NetworkSection {...props} />)
  return props
}

describe('NetworkSection', () => {
  it('always shows the network callout title and explanation', () => {
    setup()
    expect(screen.getByText('Network access')).toBeTruthy()
    expect(screen.getByText(/no internet by default/i)).toBeTruthy()
  })

  it('hides the host editor when the toggle is off', () => {
    setup({ enabled: false })
    expect(screen.queryByText(/add host/i)).toBeNull()
  })

  it('toggling the switch reports the new value', () => {
    const { onEnabledChange } = setup({ enabled: false })
    fireEvent.click(screen.getByRole('switch'))
    expect(onEnabledChange).toHaveBeenCalledWith(true)
  })

  it('shows declared hosts as removable chips and removes on click', () => {
    const { onRemoveHost } = setup({ enabled: true, hosts: ['wttr.in'] })
    expect(screen.getByText('wttr.in')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /remove wttr\.in/i }))
    expect(onRemoveHost).toHaveBeenCalledWith(0)
  })

  it('adds a typed host', () => {
    const { onAddHost } = setup({ enabled: true, hosts: [] })
    fireEvent.change(screen.getByPlaceholderText('api.github.com'), {
      target: { value: 'espn.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add host/i }))
    expect(onAddHost).toHaveBeenCalledWith('espn.com')
  })

  it('hides the add control at the max host count', () => {
    setup({ enabled: true, hosts: ['a.com', 'b.com', 'c.com', 'd.com'] })
    expect(screen.queryByPlaceholderText('api.github.com')).toBeNull()
    expect(screen.queryByText(/add host/i)).toBeNull()
  })
})
