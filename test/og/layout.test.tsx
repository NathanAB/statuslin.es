import type { ReactElement } from 'react'
import satori from 'satori'
import { describe, expect, it } from 'vitest'
import { configCard, homeCard, type ModCardBody, modCard } from '@/og/card'
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
async function layout(element: ReactElement): Promise<{ root: Box; content: Box[] }> {
  const boxes: Box[] = []
  await satori(element, { ...cardSatoriOptions(), onNodeDetected: (node) => boxes.push(node) })
  const [root, ...content] = [...boxes].sort((a, b) => b.width * b.height - a.width * a.height)
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
  it('centers the home card content within the card', async () => {
    const { root, content } = await layout(homeCard())
    expect(root).toMatchObject(FILLS_THE_CARD)
    const m = margins(content)
    expect(Math.abs(m.left - m.right)).toBeLessThanOrEqual(1)
    expect(Math.abs(m.top - m.bottom)).toBeLessThanOrEqual(1)
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
