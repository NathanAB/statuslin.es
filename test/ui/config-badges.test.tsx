// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConfigBadges } from '@/ui/config-badges'

describe('ConfigBadges', () => {
  it('renders the interpreter chip', () => {
    render(<ConfigBadges interpreter="bash" usesNetwork={false} />)
    expect(screen.getByText('bash')).toBeTruthy()
  })

  it('renders the network chip next to the interpreter when usesNetwork is true', () => {
    render(<ConfigBadges interpreter="python" usesNetwork={true} />)
    expect(screen.getByText('python')).toBeTruthy()
    expect(screen.getByText('network')).toBeTruthy()
  })

  it('omits the network chip when usesNetwork is false', () => {
    render(<ConfigBadges interpreter="bash" usesNetwork={false} />)
    expect(screen.queryByText('network')).toBeNull()
  })
})
