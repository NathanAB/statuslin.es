// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstallPrompt } from '@/ui/install-prompt'

// The same install button as the home page's hero: the redesign's pill, its icon trailing.
describe('InstallPrompt', () => {
  it("is the home page's pill, beside the copy count", () => {
    render(
      <InstallPrompt prompt="p" title="Pace" count={3} pasteHint="Paste it." onCopied={() => {}} />,
    )

    const button = screen.getByRole('button', { name: 'Copy install prompt for Pace' })
    expect(button.getAttribute('data-size')).toBe('pill')
    expect(button.getAttribute('data-variant')).toBe('default')
    expect(screen.getByText('3 copies')).toBeTruthy()
  })
})
