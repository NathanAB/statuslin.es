import { assertNotProduction } from './env'

// Side-effect import: dev-only CLIs that import `@/db` statically (scripts/dev-login.ts,
// scripts/seed-gallery.ts) import this FIRST — before `@/db` — so they refuse to run wherever
// NODE_ENV=production (the prod AND staging images, same Dockerfile) before connecting or forging
// anything. They ship in the prod image via the Dockerfile's `COPY . .`, so this guard is the only
// thing stopping a forged admin session there. (CLIs that import `@/db` lazily — the loadtest
// scripts — call assertNotProduction directly instead.) See ./env.
assertNotProduction('This dev/seed CLI (it can forge an admin session or seed data)')
