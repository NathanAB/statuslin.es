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

  it('passes a dropped event through as dropped', () => {
    expect(tagAutomatedBrowser(() => PERSON)(null)).toBeNull()
  })
})
