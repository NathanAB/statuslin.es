import { spawn, spawnSync } from 'node:child_process'
import { parseFlyImageReference } from './deploy-staging'

const PRODUCTION_APP = 'statuslines'
const STAGING_APP = 'statuslines-staging'
const PRODUCTION_URL = 'https://statuslin.es'
const STAGING_URL = 'https://staging.statuslin.es'

type ImageCheckpoint = {
  productionBefore: string
  productionNow: string
  stagingBefore: string
  stagingNow: string
}

/** Promotion is valid only while both checked deployments remain unchanged. */
export function assertImageReferencesUnchanged(checkpoint: ImageCheckpoint): void {
  if (checkpoint.productionBefore !== checkpoint.productionNow)
    throw new Error(
      `production image changed during validation (${checkpoint.productionBefore} → ${checkpoint.productionNow})`,
    )
  if (checkpoint.stagingBefore !== checkpoint.stagingNow)
    throw new Error(
      `staging image changed during validation (${checkpoint.stagingBefore} → ${checkpoint.stagingNow})`,
    )
}

function attributeValues(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []))
}

function assetsFromHtml(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin
  const sources = [
    ...attributeValues(html, /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    ...attributeValues(
      html,
      /<link\b(?=[^>]*\brel=["'][^"']*\b(?:stylesheet|modulepreload)\b[^"']*["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    ),
  ]
  return sources
    .map((source) => new URL(source, pageUrl))
    .filter((url) => url.origin === origin)
    .map((url) => url.href)
}

/**
 * Save the current production generation's assets from the three stable pages and one real detail
 * page. The caller supplies page loading so this remains unit-testable without network access.
 */
export async function collectProductionAssetUrls(
  origin: string,
  fetchPage: (url: string) => Promise<string>,
): Promise<string[]> {
  const base = origin.replace(/\/$/, '')
  const homeUrl = `${base}/`
  const home = await fetchPage(homeUrl)
  const detailHref = attributeValues(home, /<a\b[^>]*\bhref=["'](\/c\/[^"'?#]+)["'][^>]*>/gi)[0]
  if (!detailHref) throw new Error('production homepage has no linked detail page')

  const pageUrls = [homeUrl, `${base}/resources`, `${base}/terms`, new URL(detailHref, base).href]
  const pages = await Promise.all(
    pageUrls.map(async (pageUrl) => ({ html: await fetchPage(pageUrl), pageUrl })),
  )
  const pageAssets = pages.map(({ html, pageUrl }) => ({
    assets: assetsFromHtml(html, pageUrl),
    pageUrl,
  }))
  for (const { assets, pageUrl } of pageAssets) {
    if (assets.length === 0)
      throw new Error(`${new URL(pageUrl).pathname} has no qualifying same-origin asset`)
  }
  return [...new Set(pageAssets.flatMap(({ assets }) => assets))].sort()
}

const CONTENT_TYPES: Record<string, RegExp> = {
  '.css': /^text\/css\b/i,
  '.gif': /^image\/gif\b/i,
  '.jpeg': /^image\/jpeg\b/i,
  '.jpg': /^image\/jpeg\b/i,
  '.js': /^(?:text|application)\/javascript\b/i,
  '.mjs': /^(?:text|application)\/javascript\b/i,
  '.png': /^image\/png\b/i,
  '.svg': /^image\/svg\+xml\b/i,
  '.webp': /^image\/webp\b/i,
  '.woff': /^font\/woff\b/i,
  '.woff2': /^font\/woff2\b/i,
}

/** Validate one retained asset response, including the common HTML fallback failure mode. */
export async function assertAssetResponse(url: string, response: Response): Promise<void> {
  if (response.status !== 200) throw new Error(`${url} returned status ${response.status}`)
  const pathname = new URL(url).pathname.toLowerCase()
  const extension = Object.keys(CONTENT_TYPES).find((candidate) => pathname.endsWith(candidate))
  const contentType = response.headers.get('content-type') ?? ''
  const expectedType = extension ? CONTENT_TYPES[extension] : undefined
  if (!expectedType?.test(contentType))
    throw new Error(`${url} has unexpected content-type ${contentType || '(missing)'}`)
  const cacheControl = response.headers.get('cache-control') ?? ''
  const contradictory = cacheControl.match(/(?:^|,)\s*(no-store|no-cache)\b/i)?.[1]
  if (contradictory) throw new Error(`${url} has contradictory ${contradictory} caching`)
  if (!/\bimmutable\b/i.test(cacheControl)) throw new Error(`${url} is missing immutable caching`)
  const maxAge = Number(cacheControl.match(/(?:^|,)\s*max-age=(\d+)\b/i)?.[1] ?? 0)
  if (maxAge < 31_536_000) throw new Error(`${url} has insufficient max-age caching`)

  const beginning = new TextDecoder().decode((await response.arrayBuffer()).slice(0, 256))
  const withoutLeadingComments = beginning.replace(/^\s*(?:<!--[\s\S]*?-->\s*)*/, '')
  if (/^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(withoutLeadingComments))
    throw new Error(`${url} returned an HTML body instead of an asset`)
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned status ${response.status}`)
  return response.text()
}

async function verifyAssets(assetUrls: string[], targetOrigin: string): Promise<void> {
  const target = new URL(targetOrigin)
  for (const productionAssetUrl of assetUrls) {
    const source = new URL(productionAssetUrl)
    const url = new URL(`${source.pathname}${source.search}`, target).href
    await assertAssetResponse(url, await fetch(url))
  }
}

function readImage(app: string, label: string): string {
  const shown = spawnSync('fly', ['image', 'show', '--app', app, '--json'], {
    encoding: 'utf8',
  })
  if (shown.status !== 0) throw new Error(`could not read ${label} image`)
  return parseFlyImageReference(shown.stdout, label)
}

function run(command: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [bin, ...args] = command
  if (!bin) throw new Error('cannot run an empty command')
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env, stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

export async function main(): Promise<void> {
  const productionBefore = readImage(PRODUCTION_APP, 'production')
  const stagingBefore = readImage(STAGING_APP, 'staging')
  const assetUrls = await collectProductionAssetUrls(PRODUCTION_URL, fetchPage)

  const smokeEnv = { ...process.env }
  smokeEnv.SMOKE_BASE_URL = STAGING_URL
  smokeEnv.SMOKE_SIGNED_OUT_ONLY = '1'
  if ((await run(['bun', 'run', 'smoke'], smokeEnv)) !== 0)
    throw new Error('staging browser smoke failed')

  await verifyAssets(assetUrls, STAGING_URL)
  assertImageReferencesUnchanged({
    productionBefore,
    productionNow: readImage(PRODUCTION_APP, 'production'),
    stagingBefore,
    stagingNow: readImage(STAGING_APP, 'staging'),
  })

  if ((await run(['fly', 'deploy', '--app', PRODUCTION_APP, '--image', stagingBefore])) !== 0)
    throw new Error('production promotion failed')

  await verifyAssets(assetUrls, PRODUCTION_URL)
  console.log(`production is running validated image ${stagingBefore}`)
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
