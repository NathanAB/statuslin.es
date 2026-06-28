import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { requireEnv } from '@/lib/env'
import { assertProductionDbTls } from './assert-tls'

const url = requireEnv('DATABASE_URL')
// fly.toml runs this as the prod release_command — refuse to migrate over plaintext in prod.
assertProductionDbTls(url, process.env.NODE_ENV)
const client = postgres(url, { max: 1 })
const db = drizzle({ client })
await migrate(db, { migrationsFolder: './drizzle' })
await client.end()
console.log('migrations applied')
