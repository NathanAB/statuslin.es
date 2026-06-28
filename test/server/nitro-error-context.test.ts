import { describe, expect, it } from 'vitest'
import { serverErrorContextFromNitro } from '@/server/nitro-error-context'

describe('serverErrorContextFromNitro', () => {
  it('tags a request error as "ssr" with safe path + method + tags only', () => {
    const ctx = serverErrorContextFromNitro({
      event: { req: { url: 'https://statuslin.es/c/my-slug?sort=top', method: 'GET' } },
      tags: ['request'],
    })
    expect(ctx.source).toBe('ssr')
    expect(ctx.properties).toEqual({ path: '/c/my-slug', method: 'GET', tags: ['request'] })
  })

  it('classifies an uncaughtException as "uncaught"', () => {
    const ctx = serverErrorContextFromNitro({ tags: ['uncaughtException'] })
    expect(ctx.source).toBe('uncaught')
  })

  it('classifies an unhandledRejection as "uncaught"', () => {
    const ctx = serverErrorContextFromNitro({ tags: ['unhandledRejection'] })
    expect(ctx.source).toBe('uncaught')
  })

  it('defaults to "ssr" and omits path/method when there is no event', () => {
    const ctx = serverErrorContextFromNitro({ tags: ['plugin'] })
    expect(ctx.source).toBe('ssr')
    expect(ctx.properties).toEqual({ tags: ['plugin'] })
  })

  it('does not throw and omits the path when the request url is unparseable', () => {
    const ctx = serverErrorContextFromNitro({
      event: { req: { url: ':://not a url', method: 'POST' } },
    })
    expect(ctx.source).toBe('ssr')
    expect(ctx.properties).toMatchObject({ method: 'POST' })
    expect(ctx.properties).not.toHaveProperty('path')
  })

  it('never attaches anything beyond path/method/tags (redaction allowlist)', () => {
    const ctx = serverErrorContextFromNitro({
      event: { req: { url: 'https://statuslin.es/submit', method: 'POST' } },
      tags: ['request'],
    })
    expect(Object.keys(ctx.properties ?? {}).sort()).toEqual(['method', 'path', 'tags'])
  })

  it('handles a fully empty context without throwing', () => {
    expect(() => serverErrorContextFromNitro()).not.toThrow()
    expect(serverErrorContextFromNitro().source).toBe('ssr')
  })
})
