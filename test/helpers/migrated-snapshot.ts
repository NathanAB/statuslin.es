import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    migratedPGliteSnapshot: string
  }
}

// Vitest global setup: once per run, before any test file, apply the committed migrations from
// ./drizzle to one PGlite and save its data dir to a temp file that migratedPGlite()
// (test/helpers/test-db.ts) loads. The file is deleted when the run ends.
export async function setup(project: TestProject) {
  const client = await PGlite.create()
  await migrate(drizzle({ client }), { migrationsFolder: './drizzle' })
  const snapshot = await client.dumpDataDir('none')
  await client.close()

  const dir = await mkdtemp(join(tmpdir(), 'statuslines-pglite-'))
  const path = join(dir, 'migrated.tar')
  await writeFile(path, new Uint8Array(await snapshot.arrayBuffer()))
  project.provide('migratedPGliteSnapshot', path)
  return () => rm(dir, { recursive: true, force: true })
}
