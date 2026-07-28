import { lstat, readFile, realpath } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { defineEventHandler, getRequestURL } from 'h3'

const RETAINED_ASSETS_DIR = resolve(process.cwd(), '.output/public/assets')
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

function isNotFoundError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

async function readAssetFile(path: string): Promise<ArrayBuffer> {
  return Uint8Array.from(await readFile(path)).buffer
}

function decodePath(pathname: string): string | undefined {
  let decoded = pathname
  try {
    for (let index = 0; index < 3; index++) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return undefined
  }
  if (
    !decoded.startsWith('/assets/') ||
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    return undefined
  }
  return decoded.slice('/assets/'.length)
}

async function containedRegularFile(
  assetsDir: string,
  assetPath: string,
): Promise<{ filePath: string; size: number } | undefined> {
  if (!assetPath) return undefined

  try {
    const root = await realpath(assetsDir)
    const filePath = resolve(root, assetPath)
    if (!filePath.startsWith(`${root}${sep}`)) return undefined
    const [stats, canonicalPath] = await Promise.all([lstat(filePath), realpath(filePath)])
    if (!stats.isFile() || stats.isSymbolicLink() || canonicalPath !== filePath) return undefined
    return { filePath, size: stats.size }
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

export function createRetainedAssetHandler(
  assetsDir = RETAINED_ASSETS_DIR,
  readAsset: (path: string) => Promise<ArrayBuffer> = readAssetFile,
) {
  return defineEventHandler(async (event) => {
    const method = event.req.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: new Headers({ allow: 'GET, HEAD' }),
      })
    }

    const assetPath = decodePath(getRequestURL(event).pathname)
    if (!assetPath) return notFound()
    const file = await containedRegularFile(assetsDir, assetPath)
    if (!file) return notFound()

    const headers = new Headers({
      'Cache-Control': IMMUTABLE_CACHE,
      'Content-Length': String(file.size),
      'Content-Type':
        CONTENT_TYPES[extname(file.filePath).toLowerCase()] ?? 'application/octet-stream',
    })
    if (method === 'HEAD') return new Response(null, { headers })
    try {
      return new Response(await readAsset(file.filePath), { headers })
    } catch (error) {
      if (isNotFoundError(error)) return notFound()
      throw error
    }
  })
}

// Nitro route modules require a default handler export.
// biome-ignore lint/style/noDefaultExport: framework-required route-module contract
export default createRetainedAssetHandler()
