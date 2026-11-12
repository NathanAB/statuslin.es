// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BadgeImage } from '@/ui/badge-image'

describe('BadgeImage', () => {
  it('shows the badge at its own 20px height and width, never stretched by a flex column', () => {
    render(<BadgeImage src="/badge/mods/radar.svg" alt="Reviewed on statuslin.es" />)

    const image = screen.getByRole('img', { name: 'Reviewed on statuslin.es' })
    expect(image.getAttribute('src')).toBe('/badge/mods/radar.svg')
    expect(image.getAttribute('height')).toBe('20')
    expect(image.hasAttribute('width')).toBe(false)
    expect(image.className).toContain('self-start')
  })
})
