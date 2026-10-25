import type { ReactElement } from 'react'
import satori, { type SatoriNode } from 'satori'
import { describe, expect, it } from 'vitest'
import { HERO_LEAD } from '@/home/home-hero'
import { HOME_HERO_HEADING } from '@/lib/page-title'
import {
  configCard,
  DETAIL_PADDING_Y,
  HOME_CARD_STATUS_LINE,
  homeCard,
  type ModCardBody,
  modCard,
} from '@/og/card'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { cardSatoriOptions } from '@/og/render'
import type { AnsiSegment } from '@/render/types'
import { SEEDED_DESKTOP_SHOT } from '../mods/seed-mods'

type Box = { left: number; top: number; width: number; height: number }

const seg = (text: string, fg: string | null = null): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

/** Where satori puts each element, split into the card's root element and everything inside it.
 * The PNG tests only prove an image comes out; these boxes show where the content landed. */
async function layout(element: ReactElement): Promise<{ root: Box; content: SatoriNode[] }> {
  const nodes: SatoriNode[] = []
  await satori(element, { ...cardSatoriOptions(), onNodeDetected: (node) => nodes.push(node) })
  const [root, ...content] = [...nodes].sort((a, b) => b.width * b.height - a.width * a.height)
  if (!root) throw new Error('satori laid out no elements')
  return { root, content }
}

function margins(content: Box[]) {
  return {
    left: Math.min(...content.map((b) => b.left)),
    right: CARD_WIDTH - Math.max(...content.map((b) => b.left + b.width)),
    top: Math.min(...content.map((b) => b.top)),
    bottom: CARD_HEIGHT - Math.max(...content.map((b) => b.top + b.height)),
  }
}

const WIDE_PREVIEW = [
  ...Array.from({ length: 97 }, (_, i) => seg('█', i % 2 ? 'rgb(187,0,187)' : null)),
  seg('[-]\n❯ '),
]

/** A status line that draws a box `rows` lines tall. */
function boxPreview(rows: number): AnsiSegment[] {
  const middle = Array.from({ length: rows - 2 }, (_, i) => `│ row ${i + 2} ${' '.repeat(30)}│`)
  return [
    seg(
      ['╭─ CONTEXT ──────────────────────╮', ...middle, `╰${'─'.repeat(32)}╯`].join('\n'),
      'rgb(215,135,95)',
    ),
  ]
}

const SCENARIO_KEYS = ['clean-main', 'fresh-session', 'dirty-feature']

// The Status Line Anywhere shot's CSS size, drawn from a stand-in PNG.
const DESKTOP_SHOT = {
  src: `data:image/png;base64,${Buffer.from(SEEDED_DESKTOP_SHOT.png).toString('base64')}`,
  width: 784,
  height: 129,
}

const FILLS_THE_CARD = { left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT }

// A satori upgrade (0.26 → 0.47) started adding the root's padding to its 100% size, pushing every
// card's content off-center and past the right edge while the PNG tests still passed.
describe('og card layout', () => {
  it('keeps the home card headline, lead and status line inside the card', async () => {
    const { root, content } = await layout(homeCard())
    const statusLine = HOME_CARD_STATUS_LINE.map((s) => s.text)
    const words = content.filter(
      (n) =>
        n.textContent === HOME_HERO_HEADING ||
        n.textContent === HERO_LEAD[0] ||
        statusLine.some((text) => text === n.textContent),
    )
    expect(root).toMatchObject(FILLS_THE_CARD)
    expect(words).toHaveLength(2 + statusLine.length)
    const m = margins(words)
    expect(m.left).toBeGreaterThanOrEqual(0)
    expect(m.right).toBeGreaterThanOrEqual(0)
    expect(m.top).toBeGreaterThanOrEqual(0)
    expect(m.bottom).toBeGreaterThanOrEqual(0)
  })

  it('keeps a long status line title inside the margins and centers the content vertically', async () => {
    const { root, content } = await layout(
      configCard({
        title: 'Powerline with git, model and cost — a title long enough to wrap twice',
        author: 'Ada Lovelace',
        previews: [
          { scenarioKey: 'clean-main', segments: [seg('main', 'rgb(187,0,187)'), seg(' ↻2h6m ')] },
        ],
      }),
    )
    expect(root).toMatchObject(FILLS_THE_CARD)
    const m = margins(content)
    expect(m.right).toBeGreaterThanOrEqual(m.left - 1)
    expect(Math.abs(m.top - m.bottom)).toBeLessThanOrEqual(1)
  })

  // Dreambase Panel draws a six-row box in every scenario, so three of them ran off the top and
  // bottom of its card.
  it.each([
    ['three tall status lines', [6, 6, 6].map(boxPreview)],
    ['a status line taller than the card', [boxPreview(30)]],
    ['a status line as wide as the terminal', [WIDE_PREVIEW, WIDE_PREVIEW, WIDE_PREVIEW]],
  ])(
    'keeps a status line card with %s inside the card and centered vertically',
    async (_name, segments) => {
      const { root, content } = await layout(
        configCard({
          title: 'Dreambase Panel',
          author: '@kyleledbetter',
          previews: segments.map((s, i) => ({
            scenarioKey: SCENARIO_KEYS[i] ?? 'clean-main',
            segments: s,
          })),
        }),
      )
      expect(root).toMatchObject(FILLS_THE_CARD)
      const m = margins(content)
      expect(m.right).toBeGreaterThanOrEqual(m.left - 1)
      expect(m.bottom).toBeGreaterThanOrEqual(0)
      expect(Math.abs(m.top - m.bottom)).toBeLessThanOrEqual(1)
    },
  )

  // The body's room is the card less its header, summed before satori lays the header out. When the
  // title moved to the sans font, a sum that kept the mono font's line height for it cut a row the
  // card had room for.
  it('fills a status line card with a preview taller than the card down to its padding', async () => {
    const { content } = await layout(
      configCard({
        title: 'Dreambase Panel',
        author: '@kyleledbetter',
        previews: [{ scenarioKey: 'clean-main', segments: boxPreview(30) }],
      }),
    )
    const row = content.find((n) => n.textContent?.startsWith('│ row 2'))
    if (!row) throw new Error('the preview drew no rows')
    const m = margins(content)
    // Centered, so each margin takes half the room left under the last row.
    expect(m.bottom).toBeGreaterThanOrEqual(DETAIL_PADDING_Y)
    expect(m.bottom).toBeLessThan(DETAIL_PADDING_Y + row.height / 2)
  })

  it.each<[string, ModCardBody]>([
    [
      'the tallest terminal preview it draws',
      {
        kind: 'terminal',
        segments: [seg(Array.from({ length: 9 }, (_, i) => `row ${i + 1}`).join('\n'))],
      },
    ],
    // A recording is 100 columns wide, a mod's hide control sits in its last ones, and a pixel-art
    // row colors every cell.
    ['a terminal preview as wide as the terminal', { kind: 'terminal', segments: WIDE_PREVIEW }],
    ['no terminal preview', { kind: 'none' }],
    ['only a Desktop shot', { kind: 'desktop', shot: DESKTOP_SHOT }],
  ])('keeps a mod card with %s inside the card and centered vertically', async (_name, body) => {
    const { root, content } = await layout(
      modCard({ title: 'Usage meter', authorGithub: 'octocat', body }),
    )
    expect(root).toMatchObject(FILLS_THE_CARD)
    const m = margins(content)
    expect(m.right).toBeGreaterThanOrEqual(m.left - 1)
    expect(m.bottom).toBeGreaterThanOrEqual(0)
    expect(Math.abs(m.top - m.bottom)).toBeLessThanOrEqual(1)
  })
})
