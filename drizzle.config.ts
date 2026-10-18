import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'
import { requireEnv } from './src/lib/env'

// drizzle-kit auto-loads `.env` but NOT `.env.local` or `.env.development`, where local dev config
// lives (see .env.schema). Load them here, `.env.local` first so it wins as it does in Bun, so
// `db:generate` / `db:migrate` see DATABASE_URL locally. Already-set vars win, so Fly/inline env is
// never overridden, and on Fly neither file exists.
for (const file of ['.env.local', '.env.development']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split('\n')) {
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
