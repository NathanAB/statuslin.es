// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChoiceGroup } from '@/ui/choice-group'
import { HeroLayout } from '@/ui/hero-layout'

const OPTIONS = [
  { value: 'a', label: 'Line A' },
  { value: 'b', label: 'Line B' },
]

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/).map((name) => name.replace(/^.*:/, ''))

/** The nearest element, from `el` up, that runs an entrance. */
function entranceOf(el: Element) {
  let node: Element | null = el
  while (node && !classesOf(node).includes('animate-in')) node = node.parentElement
  if (!node) throw new Error('no entrance above this element')
  return node
}

const fades = (el: Element) => classesOf(entranceOf(el)).includes('fade-in-0')

function renderHero() {
  render(
    <HeroLayout
      heading="Claude Code status lines and mods"
      lead="A status line is the row under your prompt."
      stage={<div data-testid="stage" />}
      picker={
        <>
          <span id="pick">Pick a status line</span>
          <ChoiceGroup
            look="list"
            rise
            labelledBy="pick"
            options={OPTIONS}
            value="a"
            onValueChange={() => {}}
          />
        </>
      }
      actions={<button type="button">Copy install prompt</button>}
    />,
  )
}

describe('HeroLayout entrance', () => {
  // The title and the demo are the page's largest paint, so they only move.
  it('paints the title and the demo at once', () => {
    renderHero()
    expect(fades(screen.getByRole('heading', { level: 1 }))).toBe(false)
    expect(fades(screen.getByTestId('stage'))).toBe(false)
  })

  // The picker's rows fade in one by one. A tile and an install button showing before them read as
  // an empty box, so the whole block fades in with its rows, as the prototype's picker does.
  it('fades the picker and its button in with the rows, so the tile never shows empty', () => {
    renderHero()
    expect(fades(screen.getByRole('radio', { name: 'Line A' }))).toBe(true)
    expect(fades(screen.getByRole('radiogroup'))).toBe(true)
    expect(fades(screen.getByRole('button', { name: 'Copy install prompt' }))).toBe(true)
  })
})
