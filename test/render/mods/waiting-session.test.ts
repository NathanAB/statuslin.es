import { describe, expect, it } from 'vitest'
import { playsWaitingSession } from '@/render/mods/waiting-session'

describe('playsWaitingSession', () => {
  const step = (text: string) => ({ type: 'text' as const, text })

  it.each([
    { texts: ['/preview-waiting'], waiting: true },
    { texts: ['/pet', ' /preview-waiting\n'], waiting: true },
    { texts: [], waiting: false },
    { texts: ['/preview-busy'], waiting: false },
    { texts: ['run /preview-waiting'], waiting: false },
  ])('is $waiting for steps typing $texts', ({ texts, waiting }) => {
    expect(playsWaitingSession(texts.map(step))).toBe(waiting)
  })

  it('reads past a click step to the text steps', () => {
    const click = { type: 'click' as const, row: 21, col: 50 }

    expect(playsWaitingSession([click])).toBe(false)
    expect(playsWaitingSession([click, step('/preview-waiting')])).toBe(true)
  })
})
