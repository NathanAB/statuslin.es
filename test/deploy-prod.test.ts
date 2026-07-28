import { describe, expect, it } from 'vitest'
import {
  assertAssetResponse,
  assertImageReferencesUnchanged,
  collectProductionAssetUrls,
} from '../scripts/deploy-prod'

const SHA = `sha256:${'a'.repeat(64)}`

describe('assertImageReferencesUnchanged', () => {
  it('passes when production and staging still run the checked images', () => {
    expect(() =>
      assertImageReferencesUnchanged({
        productionBefore: `registry.fly.io/statuslines@${SHA}`,
        productionNow: `registry.fly.io/statuslines@${SHA}`,
        stagingBefore: `registry.fly.io/statuslines-staging@${SHA}`,
        stagingNow: `registry.fly.io/statuslines-staging@${SHA}`,
      }),
    ).not.toThrow()
  })

  it('rejects a concurrent staging change', () => {
    const other = `sha256:${'b'.repeat(64)}`
    expect(() =>
      assertImageReferencesUnchanged({
        productionBefore: `registry.fly.io/statuslines@${SHA}`,
        productionNow: `registry.fly.io/statuslines@${SHA}`,
        stagingBefore: `registry.fly.io/statuslines-staging@${SHA}`,
        stagingNow: `registry.fly.io/statuslines-staging@${other}`,
      }),
    ).toThrow(/staging image changed/i)
  })

  it('rejects a concurrent production change', () => {
    const other = `sha256:${'b'.repeat(64)}`
    expect(() =>
      assertImageReferencesUnchanged({
        productionBefore: `registry.fly.io/statuslines@${SHA}`,
        productionNow: `registry.fly.io/statuslines@${other}`,
        stagingBefore: `registry.fly.io/statuslines-staging@${SHA}`,
        stagingNow: `registry.fly.io/statuslines-staging@${SHA}`,
      }),
    ).toThrow(/production image changed/i)
  })
})

describe('collectProductionAssetUrls', () => {
  it('collects same-origin scripts and styles from all required pages and follows one detail link', async () => {
    const pages = new Map([
      [
        'https://statuslin.es/',
        '<script src="/assets/home.js"></script><link rel="stylesheet" href="/assets/app.css"><a href="/c/one">One</a>',
      ],
      [
        'https://statuslin.es/resources',
        '<link rel="modulepreload" href="/assets/resources.js"><script src="https://elsewhere.test/no.js"></script>',
      ],
      ['https://statuslin.es/terms', '<link rel="stylesheet" href="/assets/legal.css">'],
      ['https://statuslin.es/c/one', '<script src="/assets/detail.js"></script>'],
    ])
    const fetchPage = async (url: string) => {
      const html = pages.get(url)
      if (!html) throw new Error(`unexpected URL ${url}`)
      return html
    }

    await expect(collectProductionAssetUrls('https://statuslin.es', fetchPage)).resolves.toEqual([
      'https://statuslin.es/assets/app.css',
      'https://statuslin.es/assets/detail.js',
      'https://statuslin.es/assets/home.js',
      'https://statuslin.es/assets/legal.css',
      'https://statuslin.es/assets/resources.js',
    ])
  })

  it('rejects a homepage without a linked detail page', async () => {
    await expect(
      collectProductionAssetUrls('https://statuslin.es', async () => '<main>No configs</main>'),
    ).rejects.toThrow(/detail page/i)
  })

  it('rejects a required page that has no qualifying same-origin asset', async () => {
    const pages = new Map([
      ['https://statuslin.es/', '<script src="/assets/home.js"></script><a href="/c/one">One</a>'],
      ['https://statuslin.es/resources', '<script src="/assets/resources.js"></script>'],
      ['https://statuslin.es/terms', '<main>No assets here</main>'],
      ['https://statuslin.es/c/one', '<script src="/assets/detail.js"></script>'],
    ])

    await expect(
      collectProductionAssetUrls('https://statuslin.es', async (url) => pages.get(url) ?? ''),
    ).rejects.toThrow(/terms.*asset/i)
  })
})

describe('assertAssetResponse', () => {
  it('accepts a successful immutable response with an extension-appropriate type', async () => {
    const response = new Response('console.log("old")', {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'text/javascript; charset=utf-8',
      },
    })

    await expect(
      assertAssetResponse('https://staging.statuslin.es/assets/old.js', response),
    ).resolves.toBeUndefined()
  })

  it.each([
    [new Response('missing', { status: 404 }), /status 404/i],
    [
      new Response('<!doctype html><title>fallback</title>', {
        headers: {
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': 'text/css',
        },
      }),
      /HTML body/i,
    ],
    [
      new Response('body{}', {
        headers: {
          'cache-control': 'public, max-age=31536000, immutable, no-store',
          'content-type': 'text/css',
        },
      }),
      /no-store/i,
    ],
    [
      new Response('body{}', {
        headers: {
          'cache-control': 'public, max-age=3600, immutable',
          'content-type': 'text/css',
        },
      }),
      /max-age/i,
    ],
    [
      new Response('/* css */', {
        headers: {
          'cache-control': 'public, max-age=31536000, immutable, no-cache',
          'content-type': 'text/css',
        },
      }),
      /no-cache/i,
    ],
    ...[
      '<!-- proxy fallback --><html><body>fallback</body></html>',
      '<head><title>fallback</title></head>',
      '<body>fallback</body>',
    ].map((body): [Response, RegExp] => [
      new Response(body, {
        headers: {
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': 'text/css',
        },
      }),
      /HTML body/i,
    ]),
    [
      new Response('body{}', {
        headers: { 'cache-control': 'public, max-age=31536000', 'content-type': 'text/css' },
      }),
      /immutable/i,
    ],
  ] satisfies Array<
    [Response, RegExp]
  >)('rejects invalid retained asset responses', async (response, message) => {
    await expect(
      assertAssetResponse('https://staging.statuslin.es/assets/old.css', response),
    ).rejects.toThrow(message)
  })
})
