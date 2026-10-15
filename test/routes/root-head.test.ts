import { describe, expect, it } from 'vitest'
import { Route as RootRoute } from '@/routes/__root'

describe('root head', () => {
  it('offers a square PNG favicon, which Google Search can use, next to the SVG', async () => {
    const head = await RootRoute.options.head?.({} as never)

    expect(head?.links).toEqual(
      expect.arrayContaining([
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', href: '/favicon.png', type: 'image/png', sizes: '192x192' },
      ]),
    )
  })
})
