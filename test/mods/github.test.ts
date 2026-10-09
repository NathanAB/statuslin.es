import { describe, expect, it } from 'vitest'
import { createGitHub } from '@/mods/github'

const REPO = 'https://github.com/octocat/meter'
const SHA = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

type Route = { status: number; body?: unknown }

function fakeFetch(routes: Record<string, Route>) {
  const requested: string[] = []
  const fetchFn = async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const route = routes[url]
    if (!route) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status })
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

it('refuses a repository URL that is not on github.com', async () => {
  const { fetchFn, requested } = fakeFetch({})

  await expect(
    createGitHub(fetchFn).commitIsFetchable('https://gitlab.com/octocat/meter', SHA),
  ).rejects.toThrow(/github\.com/)
  expect(requested).toEqual([])
})
