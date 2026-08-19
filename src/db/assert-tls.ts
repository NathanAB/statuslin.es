/** Postgres `sslmode` values that actually require an encrypted connection. `disable`/`allow`/
 * `prefer` are excluded: they permit (or silently fall back to) a plaintext connection, so they
 * give no guarantee against an on-path attacker reading DB traffic. */
const ENCRYPTING_SSLMODES = new Set(['require', 'verify-ca', 'verify-full'])

/**
 * True when `url` carries an `sslmode` that forces an encrypted connection. postgres-js connects in
 * plaintext unless TLS is requested, so a URL without an encrypting `sslmode` sends every credential
 * and row over the wire unencrypted.
 */
export function hasEncryptingSslmode(url: string): boolean {
  const sslmode = new URL(url).searchParams.get('sslmode')
  return !!sslmode && ENCRYPTING_SSLMODES.has(sslmode)
}

/**
 * Throw when `url` does not force TLS. Shared by the runtime guard and the deploy-time secret check;
 * `label` names the source in the error so the two callers stay distinguishable.
 */
export function assertEncryptingDatabaseUrl(url: string, label: string): void {
  if (hasEncryptingSslmode(url)) return
  const sslmode = new URL(url).searchParams.get('sslmode')
  throw new Error(
    `${label} must enforce TLS: add \`sslmode=require\` (or verify-ca / verify-full). ` +
      `Got ${sslmode ? `sslmode=${sslmode}` : 'no sslmode'}.`,
  )
}

/**
 * Guard a production DATABASE_URL against a plaintext connection, and no-op outside production
 * (local dev and the PGlite-backed tests use a localhost Postgres with no TLS, and `@/db` is
 * imported on some of those paths).
 *
 * This throws only where it runs — it does NOT enforce at startup on its own. Call it from a true
 * startup point: the Nitro plugin (`src/server/db-tls-plugin.ts`) for the web process, the static
 * `@/db` import for the worker, and the migrate entrypoint (`src/db/migrate.ts`). The SSR bundle
 * imports `@/db` lazily, so the module-scope call in `src/db/index.ts` alone runs per request, not
 * at boot — which is why the web process needs the plugin.
 */
export function assertProductionDbTls(url: string, nodeEnv: string | undefined): void {
  if (nodeEnv !== 'production') return
  assertEncryptingDatabaseUrl(url, 'DATABASE_URL')
}
