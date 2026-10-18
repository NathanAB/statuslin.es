/**
 * Make an environment's Fly secrets match its env file:
 *   bun run secrets:push staging|production [--dry-run]
 *
 * Values are `.env.schema` layered with `.env.<env>`, whose secrets are varlock-encrypted, so
 * decrypting asks for Touch ID. The schema's `fly` tag marks the secrets this manages: each one the
 * env file sets is pushed, and one it no longer sets is unset on Fly. Other Fly secrets are left
 * alone. `--dry-run` validates and prints what would change, and changes nothing.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { assertProductionDbTls } from '@/db/assert-tls'
import { type DeployEnv, parseDeployEnv, spawnVarlock } from './deploy-env'

/** The Fly config `fly deploy` uses for each env, so the app name lives only there. */
const FLY_CONFIG: Record<DeployEnv, string> = {
  staging: 'fly.staging.toml',
  production: 'fly.toml',
}

const USAGE = 'usage: bun run secrets:push staging|production [--dry-run]'

const varlockGraph = z.object({
  // An unset item has no `value` key at all.
  config: z.record(
    z.string(),
    z.object({ value: z.unknown().optional(), isSensitive: z.boolean() }),
  ),
})
type FlyItems = z.infer<typeof varlockGraph>['config']

const flySecretList = z.array(z.object({ name: z.string() }))

type PushPlan = {
  /** `fly secrets import` input for every value to set. */
  importFile: string
  set: string[]
  /** On Fly and tagged `fly`, but the env file no longer sets them. */
  unset: string[]
  /** On Fly but not in the schema, so not this script's to change. */
  unmanaged: string[]
}

export function parseArgs(args: string[]): { deployEnv: DeployEnv; dryRun: boolean } {
  const [positional, ...extraPositional] = args.filter((arg) => !arg.startsWith('--'))
  const flags = args.filter((arg) => arg.startsWith('--'))
  const unknown = [...flags.filter((flag) => flag !== '--dry-run'), ...extraPositional]
  if (unknown.length > 0) throw new Error(`unknown argument ${unknown.join(', ')}; ${USAGE}`)
  return { deployEnv: parseDeployEnv(positional), dryRun: flags.includes('--dry-run') }
}

/** Keys the env file sets to a plaintext value. Encrypted values are `varlock(...)` calls. */
function plaintextKeys(envFileText: string): string[] {
  return envFileText.split('\n').flatMap((line) => {
    const match = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line)
    const key = match?.[1]
    const value = match?.[2] ?? ''
    const isPlaintext = value !== '' && !value.startsWith('#') && !value.startsWith('varlock(')
    return key && isPlaintext ? [key] : []
  })
}

/**
 * Decide what to push. Fly's import parser cuts an unquoted value at `#` and strips one pair of
 * surrounding quotes without unescaping anything, so a double-quoted value reads back exactly
 * unless it contains a quote or a newline.
 */
export function planPush({
  items,
  envFileText,
  flyNames,
}: {
  items: FlyItems
  envFileText: string
  flyNames: string[]
}): PushPlan {
  const entries = Object.entries(items)

  const nonStrings = entries
    .filter(([, { value }]) => value !== null && value !== undefined && typeof value !== 'string')
    .map(([key]) => key)
  if (nonStrings.length > 0)
    throw new Error(
      `${nonStrings.join(', ')} resolved to a number or boolean; add @type=string to them in .env.schema`,
    )

  const publicKeys = new Set(entries.filter(([, item]) => !item.isSensitive).map(([key]) => key))
  const plaintext = plaintextKeys(envFileText).filter((key) => !publicKeys.has(key))
  if (plaintext.length > 0)
    throw new Error(
      `${plaintext.join(', ')} are plaintext in the env file; encrypt them first with \`APP_ENV=<env> bunx varlock encrypt --file .env.<env>\``,
    )

  const values = entries.flatMap(([key, { value }]) =>
    typeof value === 'string' && value !== '' ? [[key, value] as const] : [],
  )
  const unencodable = values.filter(([, value]) => /["\n\r]/.test(value)).map(([key]) => key)
  if (unencodable.length > 0)
    throw new Error(
      `${unencodable.join(', ')} contain a double quote or newline, which fly secrets import can't read back exactly; set them with \`fly secrets set\``,
    )

  // Both Fly apps run with NODE_ENV=production, where the app refuses to boot on a plaintext DB
  // connection. Refuse here, before the push restarts the machines.
  const databaseUrl = items.DATABASE_URL?.value
  if (typeof databaseUrl === 'string') assertProductionDbTls(databaseUrl, 'production')

  const set = values.map(([key]) => key)
  return {
    importFile: values.map(([key, value]) => `${key}="${value}"\n`).join(''),
    set,
    unset: flyNames.filter((name) => name in items && !set.includes(name)),
    unmanaged: flyNames.filter((name) => !(name in items)),
  }
}

/** Every `fly`-tagged item, set or not, resolved from the schema and the env file only. */
export function loadFlyItems(deployEnv: DeployEnv, cwd = process.cwd()): FlyItems {
  const loaded = spawnVarlock('load', deployEnv, ['--filter', '#fly', '--format', 'json-full'], {
    cwd,
  })
  // stdout holds raw secret values even when validation fails, so only the redacted stderr is shown.
  if (loaded.status !== 0) throw new Error(`.env.${deployEnv} failed validation:\n${loaded.stderr}`)
  return varlockGraph.parse(JSON.parse(loaded.stdout)).config
}

function listFlySecrets(config: string): string[] {
  const listed = spawnSync('fly', ['secrets', 'list', '--config', config, '--json'], {
    encoding: 'utf8',
  })
  if (listed.status !== 0) throw new Error(`fly secrets list failed: ${listed.stderr}`)
  return flySecretList.parse(JSON.parse(listed.stdout)).map(({ name }) => name)
}

function fly(args: string[], input?: string): void {
  const ran = spawnSync('fly', args, {
    input,
    stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit'],
  })
  if (ran.status !== 0) throw new Error(`fly ${args.join(' ')} failed`)
}

export function main(args: string[]): void {
  const { deployEnv, dryRun } = parseArgs(args)
  const config = FLY_CONFIG[deployEnv]
  const plan = planPush({
    items: loadFlyItems(deployEnv),
    envFileText: readFileSync(`.env.${deployEnv}`, 'utf8'),
    flyNames: listFlySecrets(config),
  })

  const verb = dryRun ? 'would' : 'will'
  console.log(
    `${verb} set ${plan.set.length} secrets on the app in ${config}: ${plan.set.join(', ')}`,
  )
  if (plan.unset.length > 0)
    console.log(`${verb} unset, since the env file no longer sets them: ${plan.unset.join(', ')}`)
  if (plan.unmanaged.length > 0)
    console.log(`left alone, since .env.schema doesn't tag them fly: ${plan.unmanaged.join(', ')}`)
  if (dryRun) return

  fly(['secrets', 'import', '--config', config], plan.importFile)
  if (plan.unset.length > 0) fly(['secrets', 'unset', '--config', config, ...plan.unset])
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
