import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// These dev-only CLIs ship in the prod image (Dockerfile `COPY . .`) and can forge an admin
// session, seed, or wipe gallery data. They MUST refuse to run when NODE_ENV=production. Proven by
// actually spawning each script: with the guard in place, it throws before `@/db` loads/connects,
// so stderr carries the guard's message. Without the guard, `@/db` loads first and fails with a
// DATABASE_URL/TLS error instead — which lacks this message, so the assertion catches a regression
// (guard removed, ran too late, or reordered). See src/lib/env.ts.
const SCRIPTS = [
  'scripts/dev-login.ts',
  'scripts/seed-gallery.ts',
  'scripts/loadtest/seed.ts',
  'scripts/loadtest/teardown.ts',
]

describe('dev-only DB-mutating CLIs refuse to run in production', () => {
  for (const script of SCRIPTS) {
    it(`${script} exits non-zero with the guard message under NODE_ENV=production`, () => {
      const env = { ...process.env, NODE_ENV: 'production' }
      const res = spawnSync('bun', [script], { env, encoding: 'utf8', timeout: 30_000 })
      expect(res.status).not.toBe(0)
      expect(res.stderr).toMatch(/must not run in production/i)
    })
  }
})
