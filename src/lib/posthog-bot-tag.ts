import type { BeforeSendFn, CaptureResult } from 'posthog-js'

// Marks events from automated browsers `isBot: true`, so PostHog's default "filter out internal
// and test users" setting leaves them out of every report. They are tagged, not dropped: a person
// caught by mistake still counts when someone looks for them.

export interface BrowserSignals {
  /** `navigator.webdriver`: set by Playwright, Puppeteer and Selenium unless they hide it. */
  webdriver: boolean
  userAgent: string
  screenWidth: number
  screenHeight: number
  innerWidth: number
  innerHeight: number
  /** A person who pressed fullscreen also fills the screen. */
  fullscreen: boolean
  /** A phone's browser bar can hide, filling its screen too. */
  touchPoints: number
}

export function isAutomatedBrowser(s: BrowserSignals): boolean {
  if (s.webdriver || s.userAgent.includes('HeadlessChrome')) return true
  // A page as big as the whole screen has no browser window around it: a headless or kiosk run.
  // One fleet browses like that from data centres (1920x1080, every page, no chrome).
  const fillsScreen = s.innerWidth === s.screenWidth && s.innerHeight === s.screenHeight
  return fillsScreen && !s.fullscreen && s.touchPoints === 0
}

export function browserSignals(): BrowserSignals {
  return {
    webdriver: navigator.webdriver === true,
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    fullscreen: document.fullscreenElement !== null,
    touchPoints: navigator.maxTouchPoints,
  }
}

export function tagAutomatedBrowser(signals: () => BrowserSignals = browserSignals): BeforeSendFn {
  return (result: CaptureResult | null) => {
    if (!result || !isAutomatedBrowser(signals())) return result
    return { ...result, properties: { ...result.properties, isBot: true } }
  }
}
