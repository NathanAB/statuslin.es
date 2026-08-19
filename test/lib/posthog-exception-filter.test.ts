import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'
import { dropExtensionExceptions } from '@/lib/posthog-exception-filter'

function exceptionEvent(properties: Record<string, unknown>): CaptureResult {
  return { uuid: 'test', event: '$exception', properties } as CaptureResult
}

describe('dropExtensionExceptions', () => {
  it('drops the WebExtension runtime.sendMessage exception', () => {
    const event = exceptionEvent({
      $exception_list: [{ value: 'Invalid call to runtime.sendMessage(). Tab not found.' }],
    })
    expect(dropExtensionExceptions(event)).toBeNull()
  })

  it('drops known extension noise: Object Not Found and Script error', () => {
    const objectNotFound = exceptionEvent({
      $exception_list: [
        {
          value: 'Non-Error promise rejection captured with value: Object Not Found Matching Id:4',
        },
      ],
    })
    const scriptError = exceptionEvent({ $exception_list: [{ value: 'Script error.' }] })
    expect(dropExtensionExceptions(objectNotFound)).toBeNull()
    expect(dropExtensionExceptions(scriptError)).toBeNull()
  })

  it('keeps exceptions that carry a site source file', () => {
    const event = exceptionEvent({
      $exception_source: 'https://statuslin.es/assets/main.js',
      $exception_list: [{ value: 'Invalid call to runtime.sendMessage(). Tab not found.' }],
    })
    expect(dropExtensionExceptions(event)).toBe(event)
  })

  it('keeps our router-tagged errors', () => {
    const event = exceptionEvent({
      source: 'router',
      $exception_list: [{ value: 'Script error.' }],
    })
    expect(dropExtensionExceptions(event)).toBe(event)
  })

  it('keeps real defects with no signature, such as Failed to fetch', () => {
    const event = exceptionEvent({ $exception_list: [{ value: 'Failed to fetch' }] })
    expect(dropExtensionExceptions(event)).toBe(event)
  })

  it('passes through non-exception events and null unchanged', () => {
    const pageview = { uuid: 'test', event: '$pageview', properties: {} } as CaptureResult
    expect(dropExtensionExceptions(pageview)).toBe(pageview)
    expect(dropExtensionExceptions(null)).toBeNull()
  })
})
