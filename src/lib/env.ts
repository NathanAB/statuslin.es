/**
 * Read a required environment variable, throwing a clear error if it's missing.
 * The single, validated way to read required config — no scattered `process.env.X!`.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/**
 * Refuse to run in production. Several dev-only CLIs that mutate the DB or forge an admin session
 * (`scripts/dev-login.ts`, `scripts/seed-gallery.ts`, `scripts/loadtest/seed.ts` + `teardown.ts`)
 * ship in the prod image (`COPY . .`), and the runtime image sets `NODE_ENV=production`
 * (`Dockerfile`). Without this guard, anyone who can exec on a prod machine could mint an admin
 * cookie or inject/delete gallery data. Throws only when `NODE_ENV === 'production'` — which is
 * true on BOTH the prod and staging images (same Dockerfile), and false in local dev / test / CI.
 * For statically-imported `@/db` callers, run this before that import (or import the side-effect
 * module `./refuse-in-production`) so the script fails fast before connecting.
 */
export function assertNotProduction(context: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${context} must not run in production (NODE_ENV=production). It is dev-only.`)
  }
}

/** Minimum length (chars) for a secret used to sign session cookies / derive HMACs.
 * 32 bytes is the conventional floor; Better Auth only warns below this, so we refuse. */
const MIN_SECRET_LENGTH = 32

/** Obvious placeholder tokens that must never reach production as a signing secret.
 * Kept deliberately narrow so a legitimately-random base64/hex secret can't trip it. */
const PLACEHOLDER_TOKENS = ['changeme', 'change-me', 'placeholder', 'your-secret', 'example']

/**
 * Read a required secret AND refuse to start if it's too weak to safely sign session cookies.
 * This is the only protection against a forged-session attack: a weak `BETTER_AUTH_SECRET`
 * lets anyone mint a valid cookie for any user (including an admin). Better Auth merely warns
 * on a short secret — we throw at boot instead.
 *
 * Throws if the value is missing, shorter than {@link MIN_SECRET_LENGTH}, a single repeated
 * character, or contains an obvious placeholder token. Otherwise returns the value unchanged.
 */
export function requireStrongSecret(name: string): string {
  const value = requireEnv(name)
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Weak secret for ${name}: must be at least ${MIN_SECRET_LENGTH} characters (got ${value.length}). ` +
        'Generate one with `openssl rand -base64 32`.',
    )
  }
  if (new Set(value).size === 1) {
    throw new Error(`Low-entropy secret for ${name}: a single repeated character is not allowed.`)
  }
  const lower = value.toLowerCase()
  if (PLACEHOLDER_TOKENS.some((token) => lower.includes(token))) {
    throw new Error(
      `Low-entropy secret for ${name}: looks like a placeholder. Use a random value ` +
        '(`openssl rand -base64 32`).',
    )
  }
  return value
}
