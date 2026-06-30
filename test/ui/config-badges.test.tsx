// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConfigBadges } from '@/ui/config-badges'
import { TooltipProvider } from '@/ui/tooltip'

// The network chip's tooltip relies on a TooltipProvider ancestor (mounted once in
// shell.tsx for the real app); wrap renders the same way here.
const renderBadges = (props: {
  interpreter: string
  networkHosts: string[]
  readsClaudeToken?: boolean
}) =>
  render(
    <TooltipProvider>
      <ConfigBadges readsClaudeToken={false} {...props} />
    </TooltipProvider>,
  )

describe('ConfigBadges', () => {
  it('renders the interpreter chip with an icon', () => {
    const { container } = renderBadges({ interpreter: 'bash', networkHosts: [] })
    expect(screen.getByText('bash')).toBeTruthy()
    // every chip carries a lucide icon (an inline svg)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders the network chip next to the interpreter when hosts are declared', () => {
    renderBadges({ interpreter: 'python', networkHosts: ['api.frankfurter.app'] })
    expect(screen.getByText('python')).toBeTruthy()
    expect(screen.getByText('network')).toBeTruthy()
  })

  it('lists the declared hosts in the network chip accessible label', () => {
    renderBadges({ interpreter: 'bash', networkHosts: ['wttr.in', 'api.frankfurter.app'] })
    expect(screen.getByLabelText('Uses network: wttr.in, api.frankfurter.app')).toBeTruthy()
  })

  it('omits the network chip when no hosts are declared', () => {
    renderBadges({ interpreter: 'bash', networkHosts: [] })
    expect(screen.queryByText('network')).toBeNull()
  })

  it('renders the auth-token chip when readsClaudeToken is true', () => {
    renderBadges({ interpreter: 'python', networkHosts: [], readsClaudeToken: true })
    expect(screen.getByText('auth token')).toBeTruthy()
  })

  it('omits the auth-token chip when readsClaudeToken is false', () => {
    renderBadges({ interpreter: 'bash', networkHosts: [], readsClaudeToken: false })
    expect(screen.queryByText('auth token')).toBeNull()
  })
})
