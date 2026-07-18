import { describe, expect, it, vi } from 'vitest'

import {
  hasUnexpandedTemplatePath,
  templatePathGuardMiddleware,
} from '@/server/template-path-guard'

const TEMPLATE_MARKER = '$' + '{name}'

describe('hasUnexpandedTemplatePath', () => {
  it('detects raw and encoded shell template markers in the pathname', () => {
    expect(hasUnexpandedTemplatePath(`/tmp/cache-${TEMPLATE_MARKER}.json`)).toBe(true)
    expect(hasUnexpandedTemplatePath('/tmp/cache-%24%7Bname%7D.json')).toBe(true)
  })

  it('detects a raw marker even when another segment has malformed encoding', () => {
    expect(hasUnexpandedTemplatePath(`/tmp/cache-${TEMPLATE_MARKER}.json/%ZZ`)).toBe(true)
  })

  it('allows ordinary dollar signs and template markers outside the pathname', () => {
    expect(hasUnexpandedTemplatePath('/price/$5')).toBe(false)
    expect(hasUnexpandedTemplatePath(`/c/activity-feed?value=${TEMPLATE_MARKER}`)).toBe(false)
  })
})

describe('templatePathGuardMiddleware', () => {
  it('returns a 404 before continuing an unexpanded template path', async () => {
    const next = vi.fn()
    const request = new Request(`http://localhost/tmp/cache-${TEMPLATE_MARKER}.json`)
    const response = await templatePathGuardMiddleware.options.server?.({
      request,
      pathname: `/tmp/cache-${TEMPLATE_MARKER}.json`,
      context: undefined,
      handlerType: 'router',
      next,
    })

    expect(response).toEqual(expect.objectContaining({ status: 404 }))
    expect(next).not.toHaveBeenCalled()
  })

  it('continues ordinary routes', async () => {
    const downstream = {
      request: new Request('http://localhost/c/activity-feed'),
      pathname: '/c/activity-feed',
      context: undefined,
      response: new Response(null, { status: 204 }),
    }
    const next = vi.fn().mockResolvedValue(downstream)
    const response = await templatePathGuardMiddleware.options.server?.({
      request: downstream.request,
      pathname: downstream.pathname,
      context: undefined,
      handlerType: 'router',
      next,
    })

    expect(response).toBe(downstream)
    expect(next).toHaveBeenCalledOnce()
  })
})
