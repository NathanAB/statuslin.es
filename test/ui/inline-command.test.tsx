// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineCommand } from '@/ui/inline-command'

// "brew" at the end of one line and "install jq" on the next reads as two things.
describe('InlineCommand', () => {
  it('sets a short command in monospace, on one line', () => {
    render(
      <p>
        Install it with <InlineCommand>brew install jq</InlineCommand> on macOS.
      </p>,
    )

    const command = screen.getByText('brew install jq')
    expect(command.className).toContain('font-mono')
    expect(command.closest('.whitespace-nowrap')).not.toBeNull()
  })
})
