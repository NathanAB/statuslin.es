import type { CaptureResult } from 'posthog-js'

// `capture_exceptions` reports every global window error on the page, including ones thrown by a
// visitor's browser extension content scripts. This filter drops that third-party noise while
// letting anything our own code throws report as normal.
//
// The line: keep an exception when it carries a site source file (`$exception_source`) or the
// router tag our own errors set (see posthog-client-errors). Drop only exceptions that lack both
// and match a known extension signature.

// Messages that only a browser extension throws — no file in `src/` produces them.
const EXTENSION_SIGNATURES = [
  // WebExtension messaging API — no site code calls runtime.sendMessage().
  'runtime.sendMessage',
  // Known extension content-script rejection.
  'Object Not Found Matching Id',
  // Cross-origin script error with a scrubbed stack — never our bundle.
  'Script error.',
]

function exceptionMessages(properties: Record<string, unknown>): string {
  const list = properties.$exception_list
  if (!Array.isArray(list)) return ''
  return list
    .map((item) =>
      item && typeof item === 'object' ? String((item as { value?: unknown }).value ?? '') : '',
    )
    .join('\n')
}

export function dropExtensionExceptions(result: CaptureResult | null): CaptureResult | null {
  if (result?.event !== '$exception') return result
  const properties = result.properties ?? {}
  // Our own errors: a real site source file, or the router tag.
  if (properties.$exception_source || properties.source === 'router') return result
  const messages = exceptionMessages(properties)
  const isExtensionNoise = EXTENSION_SIGNATURES.some((signature) => messages.includes(signature))
  return isExtensionNoise ? null : result
}
