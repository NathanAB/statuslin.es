// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  assertFirstPartyResources,
  assertHomeDocument,
  browserCommandOutput,
  collectInitialBrowserResources,
  EXPECTED_HOME,
  FIT_WIDTHS,
  sideScrollFailures,
} from '../../scripts/smoke'

const validHome = {
  bodyText: `${EXPECTED_HOME.h1} Trending`,
  canonical: 'https://statuslin.es',
  h1: EXPECTED_HOME.h1,
  title: EXPECTED_HOME.title,
}

describe('browserCommandOutput', () => {
  it('keeps successful structured stdout separate from informational stderr', () => {
    expect(
      browserCommandOutput(
        '"{\\"title\\":\\"Claude Code Status Lines | statuslin.es\\"}"\n',
        '[agent-browser] restore: loaded; save: saved\n',
        0,
      ),
    ).toBe('"{\\"title\\":\\"Claude Code Status Lines | statuslin.es\\"}"')
  })

  it('reports stderr when agent-browser exits unsuccessfully', () => {
    expect(() => browserCommandOutput('', 'browser command failed\n', 1)).toThrow(
      /browser command failed/i,
    )
  })
})

describe('assertHomeDocument', () => {
  it('expects the gallery heading as the h1', () => {
    expect(EXPECTED_HOME.h1).toBe('Claude Code mods')
  })

  it('accepts the expected production homepage shell', () => {
    expect(() => assertHomeDocument(validHome, 'https://statuslin.es')).not.toThrow()
  })

  it.each([
    [{ ...validHome, title: 'statuslin.es' }, /title/i],
    [{ ...validHome, canonical: 'https://statuslin.es/wrong' }, /canonical/i],
    [{ ...validHome, canonical: 'https://statuslin.es/?page=2' }, /canonical/i],
    [{ ...validHome, canonical: 'https://statuslin.es/#gallery' }, /canonical/i],
    [{ ...validHome, h1: 'Wrong heading' }, /h1/i],
    [{ ...validHome, bodyText: '' }, /empty body/i],
    [{ ...validHome, bodyText: 'Application error: failed to render' }, /error shell/i],
  ])('rejects an invalid homepage document', (document, message) => {
    expect(() => assertHomeDocument(document, 'https://statuslin.es')).toThrow(message)
  })
})

describe('assertFirstPartyResources', () => {
  it('collects the historical SSR modulepreload shape as a first-party resource', () => {
    document.head.innerHTML =
      '<link rel="modulepreload" href="/assets/chunk-old.js"><link rel="preconnect" href="https://elsewhere.test">'

    expect(collectInitialBrowserResources(document, 'https://statuslin.es')).toEqual([
      {
        kind: 'modulepreload',
        url: 'https://statuslin.es/assets/chunk-old.js',
      },
    ])
  })

  it('rejects a failed modulepreload collected from the browser DOM', () => {
    document.head.innerHTML = '<link rel="modulepreload" href="/assets/old.js">'
    const resources = collectInitialBrowserResources(document, 'https://statuslin.es').map(
      (resource) => ({ ...resource, status: 404 }),
    )

    expect(() => assertFirstPartyResources(resources, 'https://statuslin.es')).toThrow(
      /old\.js.*404/i,
    )
  })

  it('accepts successful same-origin scripts, stylesheets, and modulepreloads', () => {
    expect(() =>
      assertFirstPartyResources(
        [
          { kind: 'script', status: 200, url: 'https://statuslin.es/assets/app.js' },
          { kind: 'stylesheet', status: 200, url: 'https://statuslin.es/assets/app.css' },
          { kind: 'modulepreload', status: 200, url: 'https://statuslin.es/assets/chunk.js' },
          { kind: 'script', status: 0, url: 'https://analytics.example/script.js' },
        ],
        'https://statuslin.es',
      ),
    ).not.toThrow()
  })

  it('rejects a failed same-origin script or stylesheet', () => {
    expect(() =>
      assertFirstPartyResources(
        [{ kind: 'script', status: 404, url: 'https://statuslin.es/assets/old.js' }],
        'https://statuslin.es',
      ),
    ).toThrow(/old\.js.*404/i)
  })

  it('rejects a page with no initial same-origin script, stylesheet, or modulepreload', () => {
    expect(() =>
      assertFirstPartyResources(
        [{ kind: 'script', status: 200, url: 'https://analytics.example/script.js' }],
        'https://statuslin.es',
      ),
    ).toThrow(/no same-origin.*resource/i)
  })
})

// Two layout bugs only a real browser showed (the phone menu at 320px, a long signed-in name at
// 768px) scrolled the page sideways. The smoke run now measures every page at these widths.
describe('sideScrollFailures', () => {
  it('names each page and width where the document is wider than the window', () => {
    expect(
      sideScrollFailures([
        { path: '/', width: 320, scrollWidth: 320 },
        { path: '/', width: 768, scrollWidth: 803 },
        { path: '/guide (phone menu)', width: 320, scrollWidth: 353 },
      ]),
    ).toEqual(['/ at 768px is 803px wide', '/guide (phone menu) at 320px is 353px wide'])
  })

  // A page that never loaded, or a menu that never opened, measures 0: that's a failure, not a fit.
  it('fails a measurement that found nothing', () => {
    expect(sideScrollFailures([{ path: '/ (phone menu)', width: 320, scrollWidth: 0 }])).toEqual([
      '/ (phone menu) at 320px was not measured',
    ])
  })

  it('checks a small phone, a tablet and a small laptop', () => {
    expect(FIT_WIDTHS).toEqual([320, 768, 1024])
  })
})
