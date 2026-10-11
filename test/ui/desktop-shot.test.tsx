// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DesktopShot, type DesktopShotImage } from '@/ui/desktop-shot'

const SHOT: DesktopShotImage = {
  src: '/mod-previews/v1/desktop.png',
  width: 385,
  height: 855,
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

  it('shows a card image at its CSS size, whole, cropping only a too-wide card from the right', () => {
    render(<DesktopShot shot={SHOT} alt="Radar in Claude Desktop" fit="card" />)

    const image = screen.getByRole('img', { name: 'Radar in Claude Desktop' })
    const frame = image.parentElement
    expect(image.getAttribute('width')).toBe('385')
    expect(image.getAttribute('height')).toBe('855')
    expect(image.className).toContain('max-w-none')
    expect(frame?.className).toContain('overflow-hidden')
    expect(frame?.className).toContain('w-fit')
    expect(frame?.className).not.toContain('justify-end')
  })

  it('caps a card image only well past the card height, as a safety net', () => {
    render(<DesktopShot shot={SHOT} alt="Radar in Claude Desktop" fit="card" />)

    const frame = screen.getByRole('img', { name: 'Radar in Claude Desktop' }).parentElement
    expect(frame?.className).toContain('max-h-75')
    expect(frame?.className).not.toContain('max-h-37.5')
  })
})
