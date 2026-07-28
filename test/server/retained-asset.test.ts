import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, toWebHandler } from 'h3'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRetainedAssetHandler } from '@/server/retained-asset'

const fixtureRoots = new Set<string>()

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'retained-handler-'))
  fixtureRoots.add(root)
  const assetsDir = join(root, 'assets')
  await mkdir(assetsDir)
  return { root, assetsDir }
}

afterEach(async () => {
  await Promise.all([...fixtureRoots].map((root) => rm(root, { recursive: true, force: true })))
  fixtureRoots.clear()
})

async function request(
  assetsDir: string,
  path: string,
  method = 'GET',
  fallback = vi.fn(() => new Response('SSR fallback', { status: 418 })),
  readAsset?: (path: string) => Promise<ArrayBuffer>,
) {
  const app = createApp()
    .all('/assets/**', createRetainedAssetHandler(assetsDir, readAsset))
    .all('/**', fallback)
  const handler = toWebHandler(app)
  return handler(new Request(`http://localhost${path}`, { method }))
}

describe('retained asset handler', () => {
  test.each([
    ['app.js', 'text/javascript'],
    ['app.css', 'text/css'],
    ['font.woff2', 'font/woff2'],
  ])('serves %s with its MIME type and immutable caching', async (filename: string, contentType: string) => {
    const { assetsDir } = await fixture()
    await writeFile(join(assetsDir, filename), 'contents')

    const response = await request(assetsDir, `/assets/${filename}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain(contentType)
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await response.text()).toBe('contents')
  })

  test('answers HEAD without a body', async () => {
    const { assetsDir } = await fixture()
    await writeFile(join(assetsDir, 'app.js'), 'contents')

    const response = await request(assetsDir, '/assets/app.js', 'HEAD')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('8')
    expect(await response.text()).toBe('')
  })

  test('returns 404 for a missing retained asset', async () => {
    const { assetsDir } = await fixture()
    expect((await request(assetsDir, '/assets/missing.js')).status).toBe(404)
  })

  test('returns 405 with Allow for unsupported methods', async () => {
    const { assetsDir } = await fixture()
    const response = await request(assetsDir, '/assets/app.js', 'POST')
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  test.each([
    '/assets/missing.js',
    '/assets/%252e%252e%252fsecret.js',
    '/assets/%2e%2e%2fsecret.js',
    '/assets/nested%5csecret.js',
    '/assets/nul%00.js',
  ])('returns handler 404 before the catch-all for asset-routed path %s', async (path: string) => {
    const { assetsDir } = await fixture()
    const fallback = vi.fn(() => new Response('SSR fallback', { status: 418 }))

    const response = await request(assetsDir, path, 'GET', fallback)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
    expect(fallback).not.toHaveBeenCalled()
  })

  test.each([
    '/assets/../secret.js',
    '/assets/%2e%2e/secret.js',
  ])('documents URL normalization outside the asset-route contract for %s', async (path: string) => {
    const { assetsDir } = await fixture()
    const fallback = vi.fn(() => new Response('SSR fallback', { status: 418 }))
    // WHATWG URL parsing removes `/assets/..` before H3 matches routes, so these requests never
    // enter the production `/assets/**` handler. A broad production catch-all is intentionally
    // outside this handler's contract; the application's normal catch-all owns the normalized URL.
    expect(new Request(`http://localhost${path}`).url).toBe('http://localhost/secret.js')

    const response = await request(assetsDir, path, 'GET', fallback)

    expect(response.status).toBe(418)
    expect(await response.text()).toBe('SSR fallback')
    expect(fallback).toHaveBeenCalledOnce()
  })

  test('returns handler 404 before the catch-all when the asset directory is missing', async () => {
    const { root } = await fixture()
    const fallback = vi.fn(() => new Response('SSR fallback', { status: 418 }))

    const response = await request(join(root, 'missing-assets'), '/assets/app.js', 'GET', fallback)

    expect(response.status).toBe(404)
    expect(fallback).not.toHaveBeenCalled()
  })

  test('returns handler 404 when the file disappears before the final read', async () => {
    const { assetsDir } = await fixture()
    await writeFile(join(assetsDir, 'raced.js'), 'contents')
    const fallback = vi.fn(() => new Response('SSR fallback', { status: 418 }))
    const disappeared = Object.assign(new Error('gone'), { code: 'ENOENT' })
    const readAsset = vi.fn<(path: string) => Promise<ArrayBuffer>>().mockRejectedValue(disappeared)

    const response = await request(assetsDir, '/assets/raced.js', 'GET', fallback, readAsset)

    expect(response.status).toBe(404)
    expect(fallback).not.toHaveBeenCalled()
    expect(readAsset).toHaveBeenCalledOnce()
  })

  test('preserves unexpected errors from the final read', async () => {
    const { assetsDir } = await fixture()
    await writeFile(join(assetsDir, 'denied.js'), 'contents')
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' })
    const readAsset = vi.fn<(path: string) => Promise<ArrayBuffer>>().mockRejectedValue(denied)

    const response = await request(assetsDir, '/assets/denied.js', 'GET', undefined, readAsset)

    expect(response.status).toBe(500)
    expect(readAsset).toHaveBeenCalledOnce()
  })

  test('does not follow symlinks outside the asset root', async () => {
    const { root, assetsDir } = await fixture()
    await writeFile(join(root, 'secret.js'), 'secret')
    await symlink(join(root, 'secret.js'), join(assetsDir, 'link.js'))

    expect((await request(assetsDir, '/assets/link.js')).status).toBe(404)
  })
})
