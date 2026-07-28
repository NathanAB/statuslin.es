import { spawn, spawnSync } from 'node:child_process'

const PRODUCTION_APP = 'statuslines'

type FlyImageEntry = Record<string, unknown>

function imageReference(entry: FlyImageEntry, label: string): string {
  const registry = entry.Registry
  const repository = entry.Repository
  const digest = entry.Digest
  if (typeof registry !== 'string' || !/^[a-z0-9.-]+(?::[0-9]+)?$/.test(registry))
    throw new Error(`${label} image has an unexpected registry`)
  if (typeof repository !== 'string' || !/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(repository))
    throw new Error(`${label} image has an unexpected repository`)
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest))
    throw new Error(`${label} image has an unexpected digest`)
  return `${registry}/${repository}@${digest}`
}

/** Parse the one full image reference unanimously running across an app's machines. */
export function parseFlyImageReference(jsonOutput: string, label: string): string {
  const entries = JSON.parse(jsonOutput) as unknown
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error(`no image found for ${label}`)

  const references = [
    ...new Set(entries.map((entry) => imageReference(entry as FlyImageEntry, label))),
  ]
  if (references.length !== 1)
    throw new Error(`${label} is running mixed images (${references.join(', ')})`)
  const reference = references[0]
  if (!reference) throw new Error(`no image found for ${label}`)
  return reference
}

/** Construct the staging deploy whose build inherits the exact current production image. */
export function buildStagingDeployCommand(productionImage: string): string[] {
  return [
    'fly',
    'deploy',
    '--config',
    'fly.staging.toml',
    '--build-arg',
    `PREVIOUS_IMAGE=${productionImage}`,
  ]
}

export function readFlyImageReference(app: string, label: string): string {
  const shown = spawnSync('fly', ['image', 'show', '--app', app, '--json'], {
    encoding: 'utf8',
  })
  if (shown.status !== 0)
    throw new Error(`could not read ${label} image: ${shown.stderr || shown.stdout}`)
  return parseFlyImageReference(shown.stdout, label)
}

function run(command: string[]): Promise<number> {
  const [bin, ...args] = command
  if (!bin) throw new Error('cannot run an empty command')
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

export async function main(): Promise<void> {
  const productionImage = readFlyImageReference(PRODUCTION_APP, 'production')
  console.log(`building staging with retained assets from ${productionImage}`)
  const code = await run(buildStagingDeployCommand(productionImage))
  if (code !== 0) throw new Error('staging deploy failed')
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
