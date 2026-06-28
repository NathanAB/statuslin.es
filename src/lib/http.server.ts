import { isNotFound, isRedirect } from '@tanstack/react-router'
import { setResponseStatus } from '@tanstack/react-start/server'
import { HttpError } from './http'
import { captureServerException } from './posthog-server'

/**
 * Run a server-fn handler body, mapping any thrown `HttpError` to its HTTP status before the error
 * propagates. `setResponseStatus` needs the request context, so this only runs inside a handler.
 *
 * An *unexpected* throw (a real bug, a DB/API failure) is reported to PostHog as a server error;
 * `HttpError` (a status the app raised on purpose) and router `notFound()`/`redirect()` (control
 * flow, not errors) are rethrown untouched and never reported. Capture is deduped, so a throw that
 * also bubbles to the Nitro `error` hook isn't counted twice.
 *
 * Lives in a `.server.ts` module (not alongside `HttpError`) so the server-only `setResponseStatus`
 * import never reaches the client bundle — `HttpError` itself is client-safe and imported by routes.
 */
export async function withHttpStatus<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body()
  } catch (err) {
    if (err instanceof HttpError) {
      setResponseStatus(err.status)
    } else if (!isRedirect(err) && !isNotFound(err)) {
      captureServerException(err, { source: 'server-fn' })
    }
    throw err
  }
}
