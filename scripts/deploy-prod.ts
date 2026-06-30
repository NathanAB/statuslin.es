/**
 * Gated production deploy: staging → browser smoke → promote the validated image by digest.
 *
 * Why this exists: source gates (tsc/lint/vitest) all pass while the client bundle is dead —
 * a server-only import leaking into the browser throws `Buffer is not defined`, hydration
 * fails, every button goes dead, and SSR still returns 200 so nothing alerts. On 2026-06-29
 * that shipped to prod for ~2.5h. The fix is to make a REAL browser confirm staging hydrates
 * before prod can ever see the image. Staging runs the exact same Docker image we promote, so
 * smoking staging smokes the real production bundle.
 *
 * Steps:
 *   1. deploy staging        (fly deploy --config fly.staging.toml)
 *   2. smoke staging         (signed-out browser checks: pages hydrate, no console errors)
 *   3. promote on green only  (fly deploy --app statuslines --image …@<digest>)
 *
 * Run: `bun run deploy:prod`. Aborts before promoting if the smoke fails.
 */
import { spawn, spawnSync } from 'node:child_process'

const STAGING_APP = 'statuslines-staging'
const PROD_APP = 'statuslines'
const STAGING_CONFIG = 'fly.staging.toml'
const STAGING_URL = 'https://staging.statuslin.es'

/**
 * Pull the single image digest from `fly image show --app <app> --json` output. Every machine in
 * the app runs the same image, so all `Digest` fields must agree — if they don't, the deploy
 * hasn't settled and promoting would ship an ambiguous image, so we throw instead of guessing.
 */
export function parseStagingDigest(jsonOutput: string): string {
  // fly emits PascalCase keys (Digest, Repository, …); read via an index type so we don't declare
  // a non-camelCase property name (which the linter rejects).
  const entries = JSON.parse(jsonOutput) as Array<Record<string, string>>
  const [digest, ...rest] = [...new Set(entries.map((e) => e.Digest).filter((d) => !!d))]
  if (!digest) throw new Error('no image digest found in `fly image show` output')
  if (rest.length > 0)
    throw new Error(
      `staging is running mixed images (${[digest, ...rest].join(', ')}) — deploy not settled, refusing to promote`,
    )
  if (!/^sha256:[0-9a-f]{64}$/.test(digest))
    throw new Error(`unexpected digest format from fly: ${digest}`)
  return digest
}

/** Run a command with the parent's stdio attached; resolve its exit code. */
function run(cmd: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd
    if (!bin) throw new Error('run: empty command')
    const child = spawn(bin, args, { stdio: 'inherit', env })
    // A spawn failure (e.g. `fly` not on PATH) emits 'error' and may never emit 'close' — resolve
    // non-zero so the gate fails closed instead of hanging forever.
    child.on('error', (err) => {
      console.error(`failed to run \`${bin}\`: ${err.message}`)
      resolve(1)
    })
    child.on('close', (code: number | null) => resolve(code ?? 1))
  })
}

function die(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  console.log('▸ [1/3] deploying staging …')
  if ((await run(['fly', 'deploy', '--config', STAGING_CONFIG])) !== 0) {
    die('staging deploy failed — nothing promoted')
  }

  // Capture the digest of the image now on staging (the exact thing we'll promote).
  const shown = spawnSync('fly', ['image', 'show', '--app', STAGING_APP, '--json'], {
    encoding: 'utf8',
  })
  if (shown.status !== 0) die(`could not read staging image: ${shown.stderr || shown.stdout}`)
  let digest: string
  try {
    digest = parseStagingDigest(shown.stdout)
  } catch (err) {
    die(err instanceof Error ? err.message : String(err))
  }
  console.log(`  staging image digest: ${digest}`)

  console.log('\n▸ [2/3] smoking staging in a real browser (signed-out hydration) …')
  // Member-assign the env vars (not an object literal) so their SCREAMING_SNAKE names don't trip
  // the camelCase property-name lint.
  const smokeEnv = { ...process.env }
  smokeEnv.SMOKE_BASE_URL = STAGING_URL
  smokeEnv.SMOKE_SIGNED_OUT_ONLY = '1'
  const smokeCode = await run(['bun', 'run', 'smoke'], smokeEnv)
  if (smokeCode !== 0) {
    die(`staging smoke FAILED — refusing to promote ${digest} to ${PROD_APP}. Fix staging first.`)
  }

  console.log('\n▸ [3/3] smoke green — promoting validated image to production …')
  const image = `registry.fly.io/${STAGING_APP}@${digest}`
  if ((await run(['fly', 'deploy', '--app', PROD_APP, '--image', image])) !== 0) {
    die('prod promote failed (staging is healthy; image is validated — safe to retry the promote)')
  }
  console.log(`\n✓ production now running validated image ${image}`)
}

// Only run the deploy when invoked directly (`bun run scripts/deploy-prod.ts`); importing this
// file (e.g. from the test) must NOT trigger a deploy.
if (import.meta.main) {
  await main()
}
