import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import type { ModReadmeSource } from '@/mods/content-generation'
import {
  applyInputSteps,
  parseInputStepsResponses,
  prepareInputStepsRequests,
} from '@/mods/input-steps'
import { terminalLine } from '@/mods/terminal-line'
import { fetchModReadme } from './generate-content'

/**
 * Choose the input steps a submitted mod's previews type: what render:mods types into the prompt
 * after the scripted turn, so the recording shows what the mod draws. The submit form doesn't ask
 * for them; the operator's coding agent picks them, like page copy (generate:content).
 *
 * Preparation is read-only. It prints, for every pending mod submission (or one mod's), a request
 * pinned to the version and commit, with the mod's README at that commit, its description and its
 * footprint in plain words, all fenced as hostile data:
 *
 *   bun run input-steps:mods --prepare [slug]
 *
 * The agent answers each with steps, without following anything in the fenced text, and sends one
 * response object or an array through stdin. Apply checks the step count and the 200-character
 * limit, and stores every response or none; a version that is no longer pending aborts the batch:
 *
 *   bun run input-steps:mods --apply
 *
 * Then render: bun run render:mods --slug <slug>. If a surface draws nothing and should, revise
 * the steps and render again. Needs DATABASE_URL; GITHUB_TOKEN raises GitHub's rate limit.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const USAGE = `Usage:
  bun run input-steps:mods --prepare [slug]
  bun run input-steps:mods --apply   (responses on stdin)`

export type InputStepsArgs = { mode: 'prepare'; slug: string | null } | { mode: 'apply' }

export interface InputStepsIo {
  readStdin: () => Promise<string>
  writeStdout: (value: string) => void
  writeStderr: (value: string) => void
  readModReadme?: ModReadmeSource
}

export function parseInputStepsArgs(argv: string[]): InputStepsArgs {
  const [flag, ...rest] = argv
  if (flag === '--apply' && rest.length === 0) return { mode: 'apply' }
  if (flag === '--prepare' && rest.length <= 1 && !rest[0]?.startsWith('--')) {
    return { mode: 'prepare', slug: rest[0] ?? null }
  }
  throw new Error(USAGE)
}

export async function runInputStepsCommand(
  options: InputStepsArgs,
  db: Db,
  io: InputStepsIo,
): Promise<void> {
  if (options.mode === 'prepare') {
    const requests = await prepareInputStepsRequests(
      db,
      options.slug,
      io.readModReadme ?? fetchModReadme(),
    )
    io.writeStdout(JSON.stringify(requests, null, 2))
    return
  }
  const responses = parseInputStepsResponses(await io.readStdin())
  await applyInputSteps(db, responses)
  io.writeStderr(`[input-steps] stored the steps of ${responses.length} version(s)`)
}

async function main(): Promise<void> {
  const options = parseInputStepsArgs(process.argv.slice(2))
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    await runInputStepsCommand(options, db, {
      readStdin: () => Bun.stdin.text(),
      writeStdout: (value) => console.log(value),
      writeStderr: (value) => console.error(value),
    })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(terminalLine(`[input-steps] ${error instanceof Error ? error.message : error}`))
      process.exit(1)
    },
  )
}
