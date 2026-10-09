// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScreenshotFigure } from '@/ui/screenshot-figure'

describe('ScreenshotFigure', () => {
  it('captions the figure directly, with a sized image', () => {
    render(
      <ScreenshotFigure
        src="/shot.png"
        alt="A mod in Claude Desktop"
        caption="Claude Desktop, screenshot"
        width={1600}
        height={1000}
      />,
    )

    const figure = screen.getByRole('figure')
    const image = screen.getByRole('img', { name: 'A mod in Claude Desktop' })
    expect([...figure.children].map((child) => child.tagName)).toEqual(['IMG', 'FIGCAPTION'])
    expect(figure.lastElementChild?.textContent).toBe('Claude Desktop, screenshot')
    expect(image.getAttribute('src')).toBe('/shot.png')
    expect(image.getAttribute('width')).toBe('1600')
    expect(image.getAttribute('height')).toBe('1000')
  })
})
