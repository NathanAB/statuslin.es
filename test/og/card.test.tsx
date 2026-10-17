import { describe, expect, it } from 'vitest'
import { configCard, homeCard, modCard } from '@/og/card'
import { toElementPng } from '@/og/render'
import type { AnsiSegment } from '@/render/types'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const seg = (text: string, fg: string | null = null): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

describe('og cards render to PNG', () => {
  it('homeCard produces a PNG', async () => {
    const png = await toElementPng(homeCard())
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
    expect(png.length).toBeGreaterThan(1000)
  })

  it('configCard renders a status line with a reset glyph and an icon', async () => {
    const previews = [
      {
        scenarioKey: 'clean-main',
        segments: [seg('main', 'rgb(187,0,187)'), seg(' ↻2h6m '), seg('')],
      },
    ]
    const png = await toElementPng(
      configCard({ title: 'Single-line usage', author: 'Ada Lovelace', previews }),
    )
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
    // ↻ (U+21BB) comes from the DejaVu fallback font (the Nerd Font omits it) and the powerline
    // glyph (U+E0A0) from the Nerd Font; a missing-glyph blank render would be much smaller.
    expect(png.length).toBeGreaterThan(2000)
  })

  it('configCard renders checker-board fill as a real glyph instead of tofu', async () => {
    const renderGlyph = (glyph: string) =>
      toElementPng(
        configCard({
          title: 'Weekly Quota Pacer',
          author: 'Andrew Boyd',
          previews: [
            {
              scenarioKey: 'big-context',
              segments: [seg(`F 80% █████${glyph.repeat(8)}`, 'rgb(187,187,0)')],
            },
          ],
        }),
      )

    const [checker, knownMissing] = await Promise.all([
      renderGlyph('🮕'),
      renderGlyph(String.fromCodePoint(0x10ffff)),
    ])

    expect(Buffer.from(checker).equals(Buffer.from(knownMissing))).toBe(false)
  })

  it('configCard tolerates an empty previews list and a null author', async () => {
    const png = await toElementPng(configCard({ title: 'No previews', author: null, previews: [] }))
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_MAGIC)
  })

  it('modCard draws only the first nine rows of a tall preview', async () => {
    const rows = (count: number) => [
      seg(Array.from({ length: count }, (_, i) => `row ${i + 1}`).join('\n')),
    ]
    const draw = async (count: number) =>
      Buffer.from(
        await toElementPng(
          modCard({
            title: 'Tree',
            authorGithub: 'octocat',
            body: { kind: 'terminal', segments: rows(count) },
          }),
        ),
      )

    const [eight, nine, twenty] = await Promise.all([draw(8), draw(9), draw(20)])

    expect(twenty.equals(nine)).toBe(true)
    expect(nine.equals(eight)).toBe(false)
  })
})

/** Every string a card draws, in order, read from its element tree. */
function cardText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(cardText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return cardText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

describe('og card text', () => {
  it('names a status line card as a Claude Code status line, with its author', () => {
    expect(cardText(configCard({ title: 'Dots', author: '@ada', previews: [] }))).toContain(
      'Claude Code status line · by @ada',
    )
    expect(cardText(configCard({ title: 'Dots', author: null, previews: [] }))).toMatch(
      /Claude Code status line$/,
    )
  })

  it('names a mod card as a Claude Code mod, with its author', () => {
    expect(
      cardText(
        modCard({
          title: 'Tree',
          authorGithub: 'octocat',
          body: { kind: 'terminal', segments: [seg('x')] },
        }),
      ),
    ).toContain('Claude Code mod · by @octocat')
  })

  it('says where a mod with no terminal preview or Desktop shot draws', () => {
    expect(
      cardText(modCard({ title: 'Tree', authorGithub: 'octocat', body: { kind: 'none' } })),
    ).toContain('Draws in Claude Desktop')
  })
})

/** The src of every image a card draws, read from its element tree. */
function cardImages(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(cardImages)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const { type, props } = node as { type: unknown; props: { src?: string; children?: unknown } }
  return type === 'img' && props.src ? [props.src] : cardImages(props.children)
}

describe('og mod card Desktop shot', () => {
  it('draws a Desktop shot in place of the chip', () => {
    const shot = { src: 'data:image/png;base64,c2hvdA==', width: 784, height: 129 }
    const card = modCard({
      title: 'Anywhere',
      authorGithub: 'octocat',
      body: { kind: 'desktop', shot },
    })

    expect(cardImages(card)).toEqual([shot.src])
    expect(cardText(card)).not.toContain('Draws in Claude Desktop')
  })
})
