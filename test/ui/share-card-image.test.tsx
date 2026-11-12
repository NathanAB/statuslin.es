// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShareCardImage } from '@/ui/share-card-image'

describe('ShareCardImage', () => {
  it('shows the card small, in its own proportions, and loads it only when it nears the screen', () => {
    render(
      <ShareCardImage
        src="/og/mods/radar.png"
        alt="Preview on statuslin.es"
        width={1200}
        height={630}
      />,
    )

    const image = screen.getByRole('img', { name: 'Preview on statuslin.es' })
    expect(image.getAttribute('src')).toBe('/og/mods/radar.png')
    expect(image.getAttribute('width')).toBe('1200')
    expect(image.getAttribute('height')).toBe('630')
    expect(image.getAttribute('loading')).toBe('lazy')
    const classes = image.className.split(' ')
    expect(classes).toContain('h-auto')
    expect(classes).toContain('max-w-sm')
    expect(classes).toContain('self-start')
  })
})
