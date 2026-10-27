import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGitHub,
  GITHUB_JSON_MAX_BYTES,
  PLUGIN_MANIFEST_MAX_BYTES,
  README_MAX_BYTES,
} from '@/mods/github'

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

describe('compareCommits', () => {
  it('reads how the head commit stands against the base', async () => {
    const { fetchFn } = fakeFetch({
      [api(`/compare/${BASE}...${SHA}`)]: { status: 200, body: { status: 'behind' } },
    })

    expect(await createGitHub(fetchFn).compareCommits(REPO, BASE, SHA)).toBe('behind')
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

describe('GITHUB_TOKEN', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function recordAuthorization() {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, authorization: new Headers(init?.headers).get('authorization') })
      return Response.json({ sha: SHA })
    }) as unknown as typeof fetch
    return { calls, fetchFn }
  }

  it('authenticates API requests with the token', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test')
    const { calls, fetchFn } = recordAuthorization()

    await createGitHub(fetchFn).commitIsFetchable(REPO, SHA)

    expect(calls).toEqual([{ url: api(`/commits/${SHA}`), authorization: 'Bearer ghp_test' }])
  })

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('sends no Authorization header when the token is %s', async (_name, token) => {
    vi.stubEnv('GITHUB_TOKEN', token)
    const { calls, fetchFn } = recordAuthorization()

    await createGitHub(fetchFn).commitIsFetchable(REPO, SHA)

    expect(calls.map((call) => call.authorization)).toEqual([null])
  })
})
describe('findRepo', () => {
  it('reads the repository like repoInfo', async () => {
    const { fetchFn } = fakeFetch({
      [api('')]: {
        status: 200,
        body: { full_name: 'octocat/meter', default_branch: 'main', license: null },
      },
    })

    expect(await createGitHub(fetchFn).findRepo(REPO)).toEqual({
      fullName: 'octocat/meter',
      license: null,
      defaultBranch: 'main',
    })
  })

  it('answers null for a repository GitHub does not serve', async () => {
    const { fetchFn } = fakeFetch({})

    expect(await createGitHub(fetchFn).findRepo(REPO)).toBeNull()
  })
})

describe('resolveCommit', () => {
  it('resolves a branch to its full commit hash, keeping a "/" in the name', async () => {
    const { fetchFn } = fakeFetch({
      [api('/commits/feature/x')]: { status: 200, body: new TextEncoder().encode(SHA) },
    })

    expect(await createGitHub(fetchFn).resolveCommit(REPO, 'feature/x')).toBe(SHA)
  })

  it('encodes each part of the ref, so a # cannot cut the request short', async () => {
    const { fetchFn, requested } = fakeFetch({})

    await createGitHub(fetchFn).resolveCommit(REPO, 'release#1')

    expect(requested).toEqual([api('/commits/release%231')])
  })

  it.each([404, 422])('answers null when GitHub has no such ref (%i)', async (status) => {
    const { fetchFn } = fakeFetch({ [api('/commits/nope')]: { status } })

    expect(await createGitHub(fetchFn).resolveCommit(REPO, 'nope')).toBeNull()
  })
})

describe('pluginManifestExists', () => {
  it.each([
    [
      'a folder',
      'plugins/meter',
      api(`/contents/plugins/meter/.claude-plugin/plugin.json?ref=${SHA}`),
    ],
    ['the root', '', api(`/contents/.claude-plugin/plugin.json?ref=${SHA}`)],
  ])('looks for .claude-plugin/plugin.json in %s at the commit', async (_name, path, url) => {
    const { fetchFn } = fakeFetch({ [url]: { status: 200, body: { type: 'file' } } })

    expect(await createGitHub(fetchFn).pluginManifestExists(REPO, path, SHA)).toBe(true)
  })

  it('answers false when the folder has none', async () => {
    const { fetchFn } = fakeFetch({})

    expect(await createGitHub(fetchFn).pluginManifestExists(REPO, 'docs', SHA)).toBe(false)
  })
})

describe('pluginVersion', () => {
  const rootManifest = api(`/contents/.claude-plugin/plugin.json?ref=${SHA}`)

  it.each([
    [
      'a folder',
      'plugins/meter',
      api(`/contents/plugins/meter/.claude-plugin/plugin.json?ref=${SHA}`),
    ],
    ['the root', '', rootManifest],
  ])('reads the version from plugin.json in %s at the commit', async (_name, path, url) => {
    const { fetchFn } = fakeFetch({ [url]: { status: 200, body: { version: '1.3.0' } } })

    expect(await createGitHub(fetchFn).pluginVersion(REPO, path, SHA)).toBe('1.3.0')
  })

  it('asks for the raw file, not its base64 listing', async () => {
    const { fetchFn: routed } = fakeFetch({
      [rootManifest]: { status: 200, body: { version: '1.3.0' } },
    })
    const accepts: (string | null)[] = []
    const fetchFn = ((url: string, init?: RequestInit) => {
      accepts.push(new Headers(init?.headers).get('accept'))
      return routed(url)
    }) as typeof fetch

    await createGitHub(fetchFn).pluginVersion(REPO, '', SHA)

    expect(accepts).toEqual(['application/vnd.github.raw+json'])
  })

  it.each([
    ['there is no plugin.json', {}],
    ['plugin.json has no version', { [rootManifest]: { status: 200, body: { name: 'meter' } } }],
    ['the version is not a string', { [rootManifest]: { status: 200, body: { version: 13 } } }],
    [
      'plugin.json is not JSON',
      { [rootManifest]: { status: 200, body: new TextEncoder().encode('{"version":') } },
    ],
  ])('answers null when %s', async (_name, routes: Record<string, Route>) => {
    const { fetchFn } = fakeFetch(routes)

    expect(await createGitHub(fetchFn).pluginVersion(REPO, '', SHA)).toBeNull()
  })

  it('stops reading a huge plugin.json at the byte cap and answers null', async () => {
    const CHUNK = 1024
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        const text = pulled === 1 ? '{"version":"1.3.0","pad":"' : 'a'.repeat(CHUNK)
        controller.enqueue(new TextEncoder().encode(text))
      },
    })
    const fetchFn = (async () => new Response(body)) as unknown as typeof fetch

    expect(await createGitHub(fetchFn).pluginVersion(REPO, '', SHA)).toBeNull()
    expect(pulled).toBeLessThanOrEqual(Math.ceil(PLUGIN_MANIFEST_MAX_BYTES / CHUNK) + 2)
  })

  it('throws on other GitHub failures', async () => {
    const { fetchFn } = fakeFetch({ [rootManifest]: { status: 500 } })

    await expect(createGitHub(fetchFn).pluginVersion(REPO, '', SHA)).rejects.toThrow(/500/)
  })
})

describe('pluginDescription', () => {
  const folderManifest = api(`/contents/plugins/meter/.claude-plugin/plugin.json?ref=${SHA}`)

  it("reads the description from the folder's plugin.json at the commit", async () => {
    const { fetchFn } = fakeFetch({
      [folderManifest]: { status: 200, body: { description: 'Tokens at a glance.' } },
    })

    expect(await createGitHub(fetchFn).pluginDescription(REPO, 'plugins/meter', SHA)).toBe(
      'Tokens at a glance.',
    )
  })

  it('answers an empty description when plugin.json has none, as the import stores it', async () => {
    const { fetchFn } = fakeFetch({ [folderManifest]: { status: 200, body: { name: 'meter' } } })

    expect(await createGitHub(fetchFn).pluginDescription(REPO, 'plugins/meter', SHA)).toBe('')
  })

  it.each([
    ['there is no plugin.json', {}],
    [
      'the description is not a string',
      { [folderManifest]: { status: 200, body: { description: 13 } } },
    ],
    [
      'plugin.json is not JSON',
      { [folderManifest]: { status: 200, body: new TextEncoder().encode('{"description":') } },
    ],
  ])('answers null when %s', async (_name, routes: Record<string, Route>) => {
    const { fetchFn } = fakeFetch(routes)

    expect(await createGitHub(fetchFn).pluginDescription(REPO, 'plugins/meter', SHA)).toBeNull()
  })
})

describe('reading GitHub safely', () => {
  it('asks for the bare hash when resolving a ref', async () => {
    const accepts: (string | null)[] = []
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      accepts.push(new Headers(init?.headers).get('accept'))
      return new Response(SHA, { status: 200 })
    }) as typeof fetch

    expect(await createGitHub(fetchFn).resolveCommit(REPO, 'main')).toBe(SHA)
    expect(accepts).toEqual(['application/vnd.github.sha'])
  })

  it.each(['..', '.', ''])('refuses a %j part in a ref without a request', async (part) => {
    const { fetchFn, requested } = fakeFetch({})

    await expect(createGitHub(fetchFn).resolveCommit(REPO, `main/${part}/x`)).rejects.toThrow()
    expect(requested).toEqual([])
  })

  it('refuses a JSON answer larger than it will read', async () => {
    const huge = new Uint8Array(GITHUB_JSON_MAX_BYTES + 1)
    const { fetchFn } = fakeFetch({ [api('')]: { status: 200, body: huge } })

    await expect(createGitHub(fetchFn).findRepo(REPO)).rejects.toThrow(/larger than/)
  })

  it.each([
    [403, { 'x-ratelimit-remaining': '0' }],
    [429, {}],
  ])('turns rate limiting (%i) into a 503 that says to try later', async (status, headers) => {
    const { fetchFn } = fakeFetch({ [api('')]: { status, headers } })

    await expect(createGitHub(fetchFn).findRepo(REPO)).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/try again later/),
    })
  })

  it('answers null for a private repository', async () => {
    const { fetchFn } = fakeFetch({
      [api('')]: {
        status: 200,
        body: { full_name: 'octocat/meter', default_branch: 'main', license: null, private: true },
      },
    })

    expect(await createGitHub(fetchFn).findRepo(REPO)).toBeNull()
  })

  it('compares against a default branch it is given, without reading the repository', async () => {
    const { fetchFn, requested } = fakeFetch({
      [api(`/compare/${SHA}...trunk`)]: { status: 200, body: { status: 'ahead' } },
    })

    expect(await createGitHub(fetchFn).commitIsOnDefaultBranch(REPO, SHA, 'trunk')).toBe(true)
    expect(requested).toEqual([api(`/compare/${SHA}...trunk`)])
  })
})
