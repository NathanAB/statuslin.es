import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'
import { requireEnv } from './src/lib/env'

// drizzle-kit auto-loads `.env` but NOT `.env.local`, where local dev config lives (see
// docs/deploy.md). Load it here so `db:generate` / `db:migrate` see DATABASE_URL locally.
// Already-set vars win, so Fly/inline env is never overridden, and on Fly `.env.local` is absent.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0 || line.trimStart().startsWith('#')) continue
    const key = line.slice(0, eq).trim()
    if (/^[A-Z0-9_]+$/.test(key) && process.env[key] === undefined) {
      process.env[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
    }
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  dbCredentials: { url: requireEnv('DATABASE_URL') },
})
