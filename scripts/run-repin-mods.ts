import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { CURATION_FILE, parseCuration } from '@/mods/curation'
import { createGitHub } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'
import { e2bDesktopRecorder } from '@/render/mods/desktop/recorder'
import { withModSandbox } from '@/render/mods/mod-sandbox'
import { e2bModRecorder } from '@/render/mods/recorder'
import { openAgentPipe } from './agent-pipe'
import { parseDeployEnv } from './deploy-env'
import { runGenerateContentCommand } from './generate-content'
import { importMods } from './import-mods'
import { runPublish } from './publish-mod'
import { renderMods } from './render-mods'
import { renderStatusLineDesktop } from './render-status-line-desktop'
import { assertAppEnv, assertCurationReviewed, repinsToRun, runRepin } from './repin-mods'

/**
 * Re-pin curated mods on one env, every step of docs/deploy.md's "Re-pin a mod" in one process, so
 * Touch ID is asked once. Run it in the operator's terminal (needs DATABASE_URL and E2B_API_KEY):
 *
 *   bun run with-env staging scripts/run-repin-mods.ts staging [slug...]
 *
 * It refuses a curation.json that isn't the reviewed one on origin/main (merge, then git pull). With
 * no slugs it re-pins every published curated mod whose curation.json commit isn't live. It
 * imports, renders each mod, dry-runs each publish and repeats their WARN lines, then waits twice on
 * named pipes it prints (scripts/agent-pipe.ts): for the typed confirmation before publishing, and,
 * after `cat`-ing the page-copy requests, for the response JSON. The agent answers from its shell:
 *
 *   printf 'publish 3 to staging\n' > <input pipe>
 *   cat <requests pipe>
 *   cat > <input pipe> <<'EOF' ... EOF
 *
 * When statusline-anywhere is among them, it then re-records the status line Desktop shots too.
 *
 * Exit code 0 when every mod published and its copy applied, 1 when a step stopped the run.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const log = (line: string) => console.log(terminalLine(line))

/** The curation file as origin/main last fetched it; null when git can't show it. */
function curationOnMain(): string | null {
  const shown = spawnSync('git', ['show', `origin/main:${CURATION_FILE}`], { encoding: 'utf8' })
  return shown.status === 0 ? shown.stdout : null
}

async function main(): Promise<number> {
  const [envArg, ...slugs] = process.argv.slice(2)
  const env = parseDeployEnv(envArg)
  assertAppEnv(env, process.env.APP_ENV)
  const url = requireEnv('DATABASE_URL')
  requireEnv('E2B_API_KEY')
  const onDisk = readFileSync(CURATION_FILE, 'utf8')
  assertCurationReviewed(onDisk, curationOnMain())
  const curation = parseCuration(JSON.parse(onDisk))
  if (!curation.ok) throw new Error(`fix ${CURATION_FILE} first: ${curation.errors.join('; ')}`)

  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  const github = createGitHub()
  const pipe = await openAgentPipe()
  try {
    const repins = await repinsToRun(db, curation.entries, slugs)
    return await runRepin(
      env,
      repins,
      {
        importMods: () =>
          importMods(JSON.parse(onDisk), {
            db,
            github,
            withSandbox: withModSandbox,
            log,
          }),
        renderMod: (slug) =>
          renderMods(
            { slug },
            {
              db,
              recorder: e2bModRecorder,
              desktopRecorder: e2bDesktopRecorder(),
              github,
              log,
            },
          ),
        publishMod: (argv, publishLog) => runPublish(argv, { db, github, log: publishLog }),
        prepareContent: async () => {
          let requests = ''
          await runGenerateContentCommand(
            { mode: 'prepare', slug: null, all: true, mods: true },
            db,
            {
              readStdin: async () => '',
              writeStdout: (value) => {
                requests = value
              },
              writeStderr: log,
            },
          )
          return requests
        },
        applyContent: (responses) =>
          runGenerateContentCommand({ mode: 'apply', mods: true }, db, {
            readStdin: async () => responses,
            writeStdout: log,
            writeStderr: log,
          }),
        renderStatusLineDesktop: () =>
          renderStatusLineDesktop({}, { db, desktopRecorder: e2bDesktopRecorder(), github, log }),
      },
      {
        log,
        sendRequests: (json) => {
          log(`waiting: page-copy requests are ready, run cat '${pipe.requests}'`)
          return pipe.send(json)
        },
        readInput: (prompt) => {
          log(`waiting: ${prompt}, written to '${pipe.input}'`)
          return pipe.read()
        },
      },
    )
  } finally {
    pipe.close()
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(terminalLine(`[repin-mods] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
