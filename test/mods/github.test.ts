import { describe, expect, it } from 'vitest'
import { createGitHub, README_MAX_BYTES, TARBALL_MAX_BYTES, TARBALL_MAX_FILES } from '@/mods/github'

const REPO = 'https://github.com/octocat/meter'
const SHA = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

type Route = { status: number; body?: unknown; headers?: Record<string, string> }

function fakeFetch(routes: Record<string, Route>) {
  const requested: string[] = []
  const fetchFn = async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const route = routes[url]
    if (!route) return new Response('not found', { status: 404 })
    const body =
      route.body instanceof Uint8Array
        ? new Blob([route.body as Uint8Array<ArrayBuffer>])
        : JSON.stringify(route.body ?? {})
    return new Response(body, { status: route.status, headers: route.headers ?? {} })
  }
  return { fetchFn: fetchFn as typeof fetch, requested }
}

const api = (path: string) => `https://api.github.com/repos/octocat/meter${path}`

describe('commitIsOnDefaultBranch', () => {
  it.each([
    ['ahead', true],
    ['identical', true],
    ['behind', false],
    ['diverged', false],
  ])('compares the commit to the default branch (%s → %s)', async (status, expected) => {
    const { fetchFn } = fakeFetch({
      [api('')]: { status: 200, body: { default_branch: 'trunk' } },
      [api(`/compare/${SHA}...trunk`)]: { status: 200, body: { status } },
    })

    expect(await createGitHub(fetchFn).commitIsOnDefaultBranch(REPO, SHA)).toBe(expected)
  })

  it('encodes a default branch name, so a # cannot cut the compare short', async () => {
    const { fetchFn: routed } = fakeFetch({
      [api('')]: { status: 200, body: { default_branch: 'release#1' } },
      [api(`/compare/${SHA}...release`)]: { status: 200, body: { status: 'identical' } },
      [api(`/compare/${SHA}...release%231`)]: { status: 200, body: { status: 'diverged' } },
    })
    const dropsFragment = ((url: string) => routed(url.split('#')[0] ?? url)) as typeof fetch

    expect(await createGitHub(dropsFragment).commitIsOnDefaultBranch(REPO, SHA)).toBe(false)
  })

  it('treats a commit GitHub does not know as off the default branch', async () => {
    const { fetchFn } = fakeFetch({
      [api('')]: { status: 200, body: { default_branch: 'main' } },
    })

    expect(await createGitHub(fetchFn).commitIsOnDefaultBranch(`${REPO}.git`, SHA)).toBe(false)
  })
})

describe('filesChanged', () => {
  it('lists the files changed between two commits', async () => {
    const { fetchFn } = fakeFetch({
      [api(`/compare/${BASE}...${SHA}`)]: {
        status: 200,
        body: { files: [{ filename: 'hooks/meter.ts' }, { filename: 'plugin.json' }] },
      },
    })

    expect(await createGitHub(fetchFn).filesChanged(REPO, BASE, SHA)).toEqual([
      'hooks/meter.ts',
      'plugin.json',
    ])
  })
})

describe('commitIsFetchable', () => {
  it.each([
    [200, true],
    [404, false],
    [422, false],
  ])('reads GitHub status %i as fetchable=%s', async (status, expected) => {
    const { fetchFn } = fakeFetch({ [api(`/commits/${SHA}`)]: { status } })

    expect(await createGitHub(fetchFn).commitIsFetchable(REPO, SHA)).toBe(expected)
  })

  it('throws on a GitHub error rather than reporting the commit gone', async () => {
    const { fetchFn } = fakeFetch({ [api(`/commits/${SHA}`)]: { status: 403 } })

    await expect(createGitHub(fetchFn).commitIsFetchable(REPO, SHA)).rejects.toThrow(/403/)
  })
})

it.each([
  ['not on github.com', 'https://gitlab.com/octocat/meter'],
  ['with a query', `${REPO}?`],
  ['with a query string', `${REPO}?x=1`],
  ['with a fragment', `${REPO}#readme`],
  ['with a dot-dot repository', 'https://github.com/octocat/..'],
  ['with an underscore owner', 'https://github.com/octo_cat/meter'],
])('refuses a repository URL %s without a request', async (_name, url) => {
  const { fetchFn, requested } = fakeFetch({ [api('')]: { status: 200 } })

  await expect(createGitHub(fetchFn).commitIsFetchable(url, SHA)).rejects.toThrow(/github\.com/)
  expect(requested).toEqual([])
})

it('gives up on a GitHub request that outlives the timeout', async () => {
  const hang = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })) as typeof fetch

  await expect(createGitHub(hang, 5).commitIsFetchable(REPO, SHA)).rejects.toThrow(
    /timed out|abort/i,
  )
})

describe('repoInfo', () => {
  it('reads the canonical name, SPDX licence and default branch', async () => {
    const { fetchFn } = fakeFetch({
      [api('')]: {
        status: 200,
        body: { full_name: 'OctoCat/Meter', default_branch: 'trunk', license: { spdx_id: 'MIT' } },
      },
    })

    expect(await createGitHub(fetchFn).repoInfo(REPO)).toEqual({
      fullName: 'OctoCat/Meter',
      license: 'MIT',
      defaultBranch: 'trunk',
    })
  })

  it.each([
    ['no licence', null],
    ['a licence GitHub cannot identify', { spdx_id: 'NOASSERTION' }],
  ])('records %s as null', async (_name, license) => {
    const { fetchFn } = fakeFetch({
      [api('')]: {
        status: 200,
        body: { full_name: 'octocat/meter', default_branch: 'main', license },
      },
    })

    expect((await createGitHub(fetchFn).repoInfo(REPO)).license).toBeNull()
  })
})

describe('tarball', () => {
  const tree = (entries: number, truncated = false) => ({
    status: 200,
    body: { truncated, tree: Array.from({ length: entries }, (_, i) => ({ path: `f${i}` })) },
  })
  const archiveUrl = `https://codeload.github.com/octocat/meter/tar.gz/${SHA}`

  it('downloads the repository at the commit as bytes', async () => {
    const bytes = new Uint8Array([31, 139, 8, 0])
    const { fetchFn } = fakeFetch({
      [api(`/git/trees/${SHA}?recursive=1`)]: tree(3),
      [archiveUrl]: { status: 200, body: bytes },
    })

    expect(await createGitHub(fetchFn).tarball(REPO, SHA)).toEqual(bytes)
  })

  it('downloads a repository at a commit once for every caller in a run', async () => {
    const bytes = new Uint8Array([31, 139, 8, 0])
    const { fetchFn, requested } = fakeFetch({
      [api(`/git/trees/${SHA}?recursive=1`)]: tree(3),
      [archiveUrl]: { status: 200, body: bytes },
      [api(`/git/trees/${BASE}?recursive=1`)]: tree(3),
      [`https://codeload.github.com/octocat/meter/tar.gz/${BASE}`]: { status: 200, body: bytes },
    })
    const github = createGitHub(fetchFn)

    await Promise.all([github.tarball(REPO, SHA), github.tarball(REPO, SHA)])
    await github.tarball(REPO, SHA)
    await github.tarball(REPO, BASE)

    expect(requested.filter((url) => url.includes('/tar.gz/'))).toEqual([
      archiveUrl,
      `https://codeload.github.com/octocat/meter/tar.gz/${BASE}`,
    ])
  })

  it.each([
    ['more files than the limit', tree(TARBALL_MAX_FILES + 1), /files/],
    ['a tree GitHub truncated', tree(10, true), /files/],
  ])('refuses a repository with %s before downloading it', async (_name, route, message) => {
    const { fetchFn, requested } = fakeFetch({
      [api(`/git/trees/${SHA}?recursive=1`)]: route,
      [archiveUrl]: { status: 200, body: new Uint8Array(4) },
    })

    await expect(createGitHub(fetchFn).tarball(REPO, SHA)).rejects.toThrow(message)
    expect(requested).not.toContain(archiveUrl)
  })

  it('refuses an archive larger than the limit', async () => {
    const { fetchFn } = fakeFetch({
      [api(`/git/trees/${SHA}?recursive=1`)]: tree(3),
      [archiveUrl]: { status: 200, body: new Uint8Array(TARBALL_MAX_BYTES + 1) },
    })

    await expect(createGitHub(fetchFn).tarball(REPO, SHA)).rejects.toThrow(/larger than/)
  })

  it('refuses an archive whose declared size is over the limit without reading it', async () => {
    const { fetchFn } = fakeFetch({
      [api(`/git/trees/${SHA}?recursive=1`)]: tree(3),
      [archiveUrl]: {
        status: 200,
        body: new Uint8Array(4),
        headers: { 'content-length': String(TARBALL_MAX_BYTES + 1) },
      },
    })

    await expect(createGitHub(fetchFn).tarball(REPO, SHA)).rejects.toThrow(/larger than/)
  })
})

describe('readme', () => {
  function readmeFetch(status: number, body = '') {
    const calls: Array<{ url: string; accept: string | null }> = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, accept: new Headers(init?.headers).get('accept') })
      return new Response(body, { status })
    }) as unknown as typeof fetch
    return { calls, fetchFn }
  }

  it('reads the raw README of the plugin folder at the pinned commit', async () => {
    const { calls, fetchFn } = readmeFetch(200, '# Meter')
    const github = createGitHub(fetchFn)

    expect(await github.readme('https://github.com/octocat/mods', 'plugins/meter', SHA)).toBe(
      '# Meter',
    )
    expect(await github.readme(REPO, '', SHA)).toBe('# Meter')
    expect(calls).toEqual([
      {
        url: `https://api.github.com/repos/octocat/mods/readme/plugins/meter?ref=${SHA}`,
        accept: 'application/vnd.github.raw+json',
      },
      { url: api(`/readme?ref=${SHA}`), accept: 'application/vnd.github.raw+json' },
    ])
  })

  it('returns null when there is no README and throws on other failures', async () => {
    expect(await createGitHub(readmeFetch(404).fetchFn).readme(REPO, '', SHA)).toBeNull()
    await expect(createGitHub(readmeFetch(500).fetchFn).readme(REPO, '', SHA)).rejects.toThrow(
      /500/,
    )
  })

  it('stops reading a huge README at the byte cap', async () => {
    const CHUNK = 1024
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        if (pulled > 1000) controller.close()
        else controller.enqueue(new TextEncoder().encode('a'.repeat(CHUNK)))
      },
    })
    const fetchFn = (async () => new Response(body)) as unknown as typeof fetch

    const text = await createGitHub(fetchFn).readme(REPO, '', SHA)

    expect(text).toBe('a'.repeat(README_MAX_BYTES))
    expect(pulled).toBeLessThanOrEqual(Math.ceil(README_MAX_BYTES / CHUNK) + 1)
  })
})
