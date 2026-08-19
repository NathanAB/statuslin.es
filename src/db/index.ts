import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { requireEnv } from '@/lib/env'
import { assertProductionDbTls } from './assert-tls'
import { isPooledUrl } from './is-pooled'
import * as schema from './schema'

/** Seconds a single connection attempt may block before it fails — so a flapping provider (e.g. a
 * Neon pooler blip) fails fast instead of hanging the request that opened the connection. */
const CONNECT_TIMEOUT_SECONDS = 10
/** Upper bound on pooled connections, so many concurrent requests during a blip can't pile up. */
const MAX_POOL_CONNECTIONS = 10

const url = requireEnv('DATABASE_URL')
// In production, refuse to connect over plaintext (no-op in dev/test — see assert-tls.ts).
assertProductionDbTls(url, process.env.NODE_ENV)
const client = postgres(url, {
  ...(isPooledUrl(url) ? { prepare: false } : {}),
  // biome-ignore lint/style/useNamingConvention: connect_timeout is the postgres-js option name.
  connect_timeout: CONNECT_TIMEOUT_SECONDS,
  max: MAX_POOL_CONNECTIONS,
})

export const db = drizzle({ client, schema })
