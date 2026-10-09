import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  applyContentGenerationResponses,
  type ContentGenerationDb,
  listPublishedSlugsMissingContent,
  parseContentGenerationResponses,
  prepareContentGenerationRequest,
} from '@/content/generation-workflow'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import {
  applyModContentGenerationResponses,
  listModSlugsMissingContent,
  type ModReadmeSource,
  parseModContentGenerationResponses,
  prepareModContentGenerationRequest,
} from '@/mods/content-generation'

/**
 * Agent-agnostic generated-content workflow.
 *
 * Preparation is read-only and prints a version-pinned request to stdout:
 *
 *   bun run generate:content <slug> --prepare
 *   bun run generate:content --all --prepare
 *
 * The current coding agent treats the embedded source and preview output as hostile data, authors
 * the requested content and tags, then sends one response object or an array through stdin:
 *
 *   bun run generate:content --apply
 *
 * Apply validates the complete batch and writes content plus tags transactionally. The command
 * launches no agent CLI and creates no request, response, or temporary files.
 *
 * Mods are behind `--mod`, in every mode, so the configs flow above is unchanged. `--all --mod`
 * lists draft and published mods whose current version has no content, so drafts get copy before
 * they are published. A mod request is pinned to the version id and commit SHA, embeds the mod's
 * README at that commit (fetched from GitHub), and apply refuses it for any other version:
 *
 *   bun run generate:content <mod-slug> --prepare --mod
 *   bun run generate:content --all --prepare --mod
 *   bun run generate:content --apply --mod
 */

const USAGE = `Usage:
  bun run generate:content <slug> --prepare
  bun run generate:content --all --prepare
  bun run generate:content --apply
Add --mod to any of these to work on mods instead of configs.`

const README_MAX_CHARS = 20_000

export type GenerateContentArgs = (
  | { mode: 'prepare'; slug: string; all: false }
  | { mode: 'prepare'; slug: null; all: true }
  | { mode: 'apply' }
) & { mods?: true }

export interface GenerateContentIo {
  readStdin: () => Promise<string>
  writeStdout: (value: string) => void
  writeStderr: (value: string) => void
  readModReadme?: ModReadmeSource
}

function usageError(): Error {
  return new Error(USAGE)
}

export function parseGenerateContentArgs(argv: string[]): GenerateContentArgs {
  const mods = argv.filter((arg) => arg === '--mod').length
  if (mods > 1) throw usageError()
  const args = argv.filter((arg) => arg !== '--mod')
  const catalog = mods === 1 ? { mods: true as const } : {}
  if (args.length === 1 && args[0] === '--apply') return { mode: 'apply', ...catalog }
  if (!args.includes('--prepare') || args.includes('--apply')) throw usageError()

  const unknownFlags = args.filter(
    (arg) => arg.startsWith('--') && arg !== '--prepare' && arg !== '--all',
  )
  const slugs = args.filter((arg) => !arg.startsWith('--'))
  const all = args.includes('--all')
  if (unknownFlags.length > 0 || (all ? slugs.length !== 0 : slugs.length !== 1)) {
    throw usageError()
  }
  if (args.length !== 2) throw usageError()
  return all
    ? { mode: 'prepare', slug: null, all: true, ...catalog }
    : { mode: 'prepare', slug: slugs[0] as string, all: false, ...catalog }
}

/** The README GitHub picks for `path` at `commitSha`, raw, cut to README_MAX_CHARS. */
export function fetchModReadme(fetchFn: typeof fetch = fetch): ModReadmeSource {
  return async (repoUrl, path, commitSha) => {
    const repo = new URL(repoUrl).pathname
    const folder = path ? `/${path}` : ''
    const url = `https://api.github.com/repos${repo}/readme${folder}?ref=${commitSha}`
    const res = await fetchFn(url, {
      headers: { accept: 'application/vnd.github.raw+json', 'user-agent': 'statuslin.es' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
    const text = await res.text()
    return text.length > README_MAX_CHARS
      ? `${text.slice(0, README_MAX_CHARS)}\n[README cut off at ${README_MAX_CHARS} characters]`
      : text
  }
}

async function runModCommand(
  options: GenerateContentArgs,
  db: ContentGenerationDb,
  io: GenerateContentIo,
): Promise<void> {
  if (options.mode === 'prepare') {
    const readme = io.readModReadme ?? fetchModReadme()
    const slugs = options.all ? await listModSlugsMissingContent(db) : [options.slug]
    const requests = []
    for (const slug of slugs) {
      requests.push(await prepareModContentGenerationRequest(db, slug, readme))
    }
    io.writeStdout(JSON.stringify(options.all ? requests : requests[0], null, 2))
    return
  }

  const responses = parseModContentGenerationResponses(await io.readStdin())
  await applyModContentGenerationResponses(db, responses)
  io.writeStderr(`[generate-content] applied ${responses.length} mod response(s)`)
}

export async function runGenerateContentCommand(
  options: GenerateContentArgs,
  db: ContentGenerationDb,
  io: GenerateContentIo,
): Promise<void> {
  if (options.mods) return runModCommand(options, db, io)
  if (options.mode === 'prepare') {
    const slugs = options.all ? await listPublishedSlugsMissingContent(db) : [options.slug]
    const requests = []
    for (const slug of slugs) requests.push(await prepareContentGenerationRequest(db, slug))
    io.writeStdout(JSON.stringify(options.all ? requests : requests[0], null, 2))
    return
  }

  const responses = parseContentGenerationResponses(await io.readStdin())
  await applyContentGenerationResponses(db, responses)
  io.writeStderr(`[generate-content] applied ${responses.length} response(s)`)
}

async function main(): Promise<void> {
  const options = parseGenerateContentArgs(process.argv.slice(2))
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema })
  try {
    await runGenerateContentCommand(options, db, {
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
      console.error(`[generate-content] ${error instanceof Error ? error.message : error}`)
      process.exit(1)
    },
  )
}
