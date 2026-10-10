// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DesktopShot, type DesktopShotImage } from '@/ui/desktop-shot'

const SHOT: DesktopShotImage = {
  src: '/mod-previews/v1/desktop.png',
  width: 385,
  height: 855,
  cardAnchor: 'bottom',
}

describe('DesktopShot', () => {
  it('shows the whole shot at most at its CSS size, scaling down to fit', () => {
    render(<DesktopShot shot={SHOT} alt="Radar in Claude Desktop" fit="whole" />)

    const image = screen.getByRole('img', { name: 'Radar in Claude Desktop' })
    expect(image.getAttribute('src')).toBe(SHOT.src)
    expect(image.getAttribute('width')).toBe('385')
    expect(image.getAttribute('height')).toBe('855')
    expect(image.className).toContain('max-w-full')
    expect(image.className).toContain('h-auto')
  })

  it.each([
    'top',
    'bottom',
  ] as const)('crops a card shot anchored at the %s to a fixed height without shrinking it', (cardAnchor) => {
    render(<DesktopShot shot={{ ...SHOT, cardAnchor }} alt="Radar in Claude Desktop" fit="card" />)

    const image = screen.getByRole('img', { name: 'Radar in Claude Desktop' })
    const frame = image.parentElement
    expect(image.getAttribute('width')).toBe('385')
    expect(image.className).toContain('max-w-none')
    expect(frame?.className).toContain('overflow-hidden')
    expect(frame?.className).toContain('max-h-37.5')
    expect(frame?.className.includes('justify-end')).toBe(cardAnchor === 'bottom')
  })
})
