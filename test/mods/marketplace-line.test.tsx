// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceLine } from '@/mods/marketplace-line'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

const COMMAND = '/plugin marketplace add https://site.example.test/marketplace.json'

describe('MarketplaceLine', () => {
  // A visitor who adds the marketplace gets every reviewed mod in /plugin without another visit.
  it('says what adding the marketplace gets you, then shows the command', () => {
    const { container } = render(<MarketplaceLine origin="https://site.example.test" />)

    expect(container.textContent).toContain(
      "To browse every reviewed mod from Claude Code's /plugin menu, add the marketplace in the terminal:",
    )
    expect(screen.getByText(COMMAND)).toBeTruthy()
  })

  it('copies the exact command', async () => {
    render(<MarketplaceLine origin="https://site.example.test" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy marketplace command' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(COMMAND))
  })
})
