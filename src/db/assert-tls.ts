/** Postgres `sslmode` values that actually require an encrypted connection. `disable`/`allow`/
 * `prefer` are excluded: they permit (or silently fall back to) a plaintext connection, so they
 * give no guarantee against an on-path attacker reading DB traffic. */
const ENCRYPTING_SSLMODES = new Set(['require', 'verify-ca', 'verify-full'])

/**
 * Refuse to boot in production with a DATABASE_URL that doesn't force TLS.
 *
 * postgres-js connects in plaintext unless TLS is requested, so a prod URL without an encrypting
 * `sslmode` sends every credential and row over the wire unencrypted. This throws at startup in
 * production if `sslmode` is absent or set to a non-encrypting mode.
 *
 * Intentionally a no-op outside production: local dev and the PGlite-backed tests use a localhost
 * Postgres with no TLS, and `@/db` is imported on some of those paths — gating to production keeps
 * `bun run dev`, `bun run check`, and the test suite working.
 */
export function assertProductionDbTls(url: string, nodeEnv: string | undefined): void {
  if (nodeEnv !== 'production') return
  const sslmode = new URL(url).searchParams.get('sslmode')
  if (sslmode && ENCRYPTING_SSLMODES.has(sslmode)) return
  throw new Error(
    'DATABASE_URL must enforce TLS in production: add `sslmode=require` (or verify-ca / verify-full). ' +
      `Got ${sslmode ? `sslmode=${sslmode}` : 'no sslmode'}.`,
  )
}
