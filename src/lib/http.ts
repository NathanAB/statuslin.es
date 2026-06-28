/**
 * An error that carries an HTTP status. Domain code throws this instead of a bare `Error` so the
 * boundary can return the right code (401/403/400/429/409) rather than defaulting to 500. It's a
 * plain Error subclass — no request context needed — so it stays unit-testable and client-safe
 * (routes import it). The server-only mapper that turns it into a response status lives in
 * `http.server.ts`, so importing `HttpError` never pulls a server-only import into the client.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
