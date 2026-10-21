import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Route as RootRoute } from '@/routes/__root'

describe('root head', () => {
  it('offers a square PNG favicon, which Google Search can use, next to the SVG', async () => {
    const head = await RootRoute.options.head?.({ match: {} } as never)

    expect(head?.links).toEqual(
      expect.arrayContaining([
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', href: '/favicon.png', type: 'image/png', sizes: '192x192' },
      ]),
    )
  })

  it('preloads the interface font that app.css loads, so swapping it in shifts no text', async () => {
    const head = await RootRoute.options.head?.({} as never)
    const preload = head?.links?.find((link) => link?.rel === 'preload')

    expect(preload).toMatchObject({ as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })
    // The same file as the @font-face src, or the browser downloads the font twice.
    const css = readFileSync('src/styles/app.css', 'utf8')
    const face = css.match(/@font-face\s*\{[^}]*font-family:\s*"Hanken Grotesk"[^}]*\}/)
    const src = face?.[0].match(/src:\s*url\("([^"]+)"\)/)?.[1]
    expect(src).toBeDefined()
    expect(basename(preload?.href ?? '')).toBe(basename(src ?? ''))
  })
})
