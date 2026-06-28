import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { requireEnv } from '@/lib/env'
import { assertProductionDbTls } from './assert-tls'
import { isPooledUrl } from './is-pooled'
import * as schema from './schema'

const url = requireEnv('DATABASE_URL')
// In production, refuse to connect over plaintext (no-op in dev/test — see assert-tls.ts).
assertProductionDbTls(url, process.env.NODE_ENV)
const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})

export const db = drizzle({ client, schema })
