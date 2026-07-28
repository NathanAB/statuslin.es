import type { PostHog } from 'posthog-js'

type PostHogErrorClient = Pick<PostHog, 'captureException'>

type QueuedClientError = {
  error: unknown
  path: string
}

let client: PostHogErrorClient | null = null
const queuedErrors: QueuedClientError[] = []

function capture(clientError: QueuedClientError): void {
  try {
    client?.captureException(clientError.error, {
      source: 'router',
      path: clientError.path,
    })
  } catch {
    // Error reporting must never become another route error.
  }
}

export function queuePostHogClientError(error: unknown): void {
  const clientError = {
    error,
    path: typeof location === 'undefined' ? '/' : location.pathname,
  }
  if (client) {
    capture(clientError)
    return
  }
  queuedErrors.push(clientError)
}

export function connectPostHogClientErrors(posthog: PostHogErrorClient): void {
  client = posthog
  const errorsToFlush = queuedErrors.splice(0)
  for (const error of errorsToFlush) capture(error)
}
