import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'
import { type BrowserSignals, tagAutomatedBrowser } from '@/lib/posthog-bot-tag'

const PERSON: BrowserSignals = {
  webdriver: false,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  screenWidth: 1920,
  screenHeight: 1080,
  innerWidth: 1920,
  innerHeight: 960,
  fullscreen: false,
  touchPoints: 0,
}

const pageview = (): CaptureResult =>
  ({ uuid: 'test', event: '$pageview', properties: { $pathname: '/' } }) as CaptureResult

const tagged = (signals: Partial<BrowserSignals>) =>
  tagAutomatedBrowser(() => ({ ...PERSON, ...signals }))(pageview())?.properties.isBot

describe('tagAutomatedBrowser', () => {
  it('leaves a person browsing in a normal window untagged', () => {
    expect(tagged({})).toBeUndefined()
  })

  it('tags a browser driven by automation (navigator.webdriver)', () => {
    expect(tagged({ webdriver: true })).toBe(true)
  })

  it('tags headless Chrome by its user agent', () => {
    expect(tagged({ userAgent: PERSON.userAgent.replace('Chrome/', 'HeadlessChrome/') })).toBe(true)
  })

  it('tags a desktop page that fills the whole screen with no browser window around it', () => {
    expect(tagged({ innerHeight: 1080 })).toBe(true)
  })

  it('leaves Firefox untagged when its privacy mode reports the window as the screen', () => {
    expect(
      tagged({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
        innerHeight: 1080,
      }),
    ).toBeUndefined()
  })

  it('leaves Safari untagged when its screen reads as the window size', () => {
    expect(
      tagged({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        innerHeight: 1080,
      }),
    ).toBeUndefined()
  })

  it('still tags Firefox driven by automation', () => {
    expect(
      tagged({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
        webdriver: true,
      }),
    ).toBe(true)
  })

  it('leaves a person in fullscreen mode untagged', () => {
    expect(tagged({ innerHeight: 1080, fullscreen: true })).toBeUndefined()
  })

  it('leaves a touch device whose browser bar has hidden untagged', () => {
    expect(
      tagged({
        screenWidth: 390,
        screenHeight: 844,
        innerWidth: 390,
        innerHeight: 844,
        touchPoints: 5,
      }),
    ).toBeUndefined()
  })

  it('keeps the event and its other properties', () => {
    const result = tagAutomatedBrowser(() => ({ ...PERSON, webdriver: true }))(pageview())
    expect(result?.event).toBe('$pageview')
    expect(result?.properties.$pathname).toBe('/')
  })
})
