// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  assertFirstPartyResources,
  assertHomeDocument,
  browserCommandOutput,
  collectInitialBrowserResources,
  EXPECTED_HOME,
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
