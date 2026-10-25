import type { ReactElement } from 'react'
import satori from 'satori'
import { describe, expect, it } from 'vitest'
import { configCard } from '@/og/card'
import { SANS_FONT } from '@/og/font'
import { cardSatoriOptions } from '@/og/render'
import type { AnsiSegment } from '@/render/types'

type Face = { family: string; weight: string }

const seg = (text: string): AnsiSegment => ({
  text,
  fg: null,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

/** The face satori draws each word of a card in. Without embedded fonts it leaves the card's text
 * as one <text> element per word, naming its font. */
async function drawnFaces(element: ReactElement): Promise<Map<string, Face>> {
  const svg = await satori(element, { ...cardSatoriOptions(), embedFont: false })
  const faces = new Map<string, Face>()
  for (const [, attributes = '', word = ''] of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const family = /font-family="([^"]*)"/.exec(attributes)?.[1] ?? ''
    const weight = /font-weight="([^"]*)"/.exec(attributes)?.[1] ?? ''
    faces.set(word, { family, weight: weight === 'normal' ? '400' : weight })
  }
  return faces
}

const SANS = SANS_FONT.toLowerCase()
const TERMINAL = 'statuslinenerd'

// Headings on the site are never monospace (src/ui/text.tsx). A status line and mod card share one
// header and one preview, so a title or byline set back in the mono font, or a preview set in sans,
// fails this for both.
describe('og detail card fonts', () => {
  it('sets the title and byline in sans, and the wordmark and preview in mono', async () => {
    const faces = await drawnFaces(
      configCard({
        title: 'Everyday powerline',
        author: '@octocat',
        previews: [{ scenarioKey: 'clean-main', segments: [seg('main')] }],
      }),
    )

    expect(faces.get('Everyday')).toEqual({ family: SANS, weight: '600' })
    expect(faces.get('powerline')).toEqual({ family: SANS, weight: '600' })
    for (const word of ['Claude', 'Code', 'status', 'line', 'by', 'octocat'])
      expect(faces.get(word)).toEqual({ family: SANS, weight: '400' })
    expect(faces.get('statuslin')).toEqual({ family: TERMINAL, weight: '700' })
    expect(faces.get('main')).toEqual({ family: TERMINAL, weight: '400' })
  })
})
