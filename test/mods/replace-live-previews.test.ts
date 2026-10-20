import { describe, expect, it } from 'vitest'
import { parseReplaceAnswer, replaceQuestion } from '@/mods/replace-live-previews'

const SLUGS = ['radar', 'skins', 'token-weather']

describe('replaceQuestion', () => {
  it('lists the slugs and how to answer', () => {
    expect(replaceQuestion(SLUGS)).toBe(
      'Replace the live previews of these 3 mods: radar, skins, token-weather? [y = all, n = none, or the slugs to leave out]',
    )
  })

  it('names a single mod as one', () => {
    expect(replaceQuestion(['skins'])).toBe(
      'Replace the live previews of this mod: skins? [y = all, n = none, or the slugs to leave out]',
    )
  })
})

describe('parseReplaceAnswer', () => {
  it.each(['y', 'yes', ' Y ', 'YES'])('replaces every mod for %j', (answer) => {
    expect(parseReplaceAnswer(answer, SLUGS)).toEqual({ replace: SLUGS })
  })

  it.each(['', '   ', 'n', 'no', 'No'])('replaces none for %j', (answer) => {
    expect(parseReplaceAnswer(answer, SLUGS)).toEqual({ replace: [] })
  })

  it('replaces the mods not left out, split by spaces or commas', () => {
    expect(parseReplaceAnswer('skins', SLUGS)).toEqual({ replace: ['radar', 'token-weather'] })
    expect(parseReplaceAnswer(' radar,  token-weather ', SLUGS)).toEqual({ replace: ['skins'] })
    expect(parseReplaceAnswer('radar skins,token-weather', SLUGS)).toEqual({ replace: [] })
  })

  it('replaces none and names each slug it does not recognise', () => {
    expect(parseReplaceAnswer('skins, tokn-weather radr', SLUGS)).toEqual({
      unknown: ['tokn-weather', 'radr'],
    })
  })
})
