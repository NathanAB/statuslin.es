import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { inject } from 'vitest'

// A fresh in-memory database with the real committed migrations applied, for a test file of its
// own. It loads the snapshot test/helpers/migrated-snapshot.ts makes once per run, which boots in
// ~140 ms where `new PGlite()` + migrate takes ~1 s.
export async function migratedPGlite(): Promise<PGlite> {
  const snapshot = await readFile(inject('migratedPGliteSnapshot'))
  return PGlite.create({ loadDataDir: new Blob([snapshot]) })
}
