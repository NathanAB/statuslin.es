import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { requireEnv } from '@/lib/env'
import { assertProductionDbTls } from './assert-tls'
import { isPooledUrl } from './is-pooled'
import * as schema from './schema'

const url = requireEnv('DATABASE_URL')
// Runtime guard against a plaintext production DB connection. This fails fast at boot only where
// `@/db` is imported statically (the worker); the SSR bundle imports `@/db` lazily, so the web
// process fails fast via src/server/db-tls-plugin.ts instead. No-op in dev/test — see assert-tls.ts.
assertProductionDbTls(url, process.env.NODE_ENV)
const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})

export const db = drizzle({ client, schema })
