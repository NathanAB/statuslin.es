import { describe, expect, it } from 'vitest'
import type { RepoInfo } from '@/mods/github'
import { type LinkGitHub, parseModLink, resolveModLink } from '@/mods/link'

const SHA = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const REPO = 'https://github.com/octocat/mods'

describe('parseModLink', () => {
  it.each([
    ['a repository', REPO, { repoUrl: REPO, refAndPath: [] }],
    ['a repository with a trailing slash', `${REPO}/`, { repoUrl: REPO, refAndPath: [] }],
    ['a repository ending in .git', `${REPO}.git`, { repoUrl: REPO, refAndPath: [] }],
    ['www.github.com', 'https://www.github.com/octocat/mods', { repoUrl: REPO, refAndPath: [] }],
    ['plain http', 'http://github.com/octocat/mods', { repoUrl: REPO, refAndPath: [] }],
    ['a query and fragment', `${REPO}?tab=readme#top`, { repoUrl: REPO, refAndPath: [] }],
    [
      'a folder',
      `${REPO}/tree/main/plugins/meter`,
      { repoUrl: REPO, refAndPath: ['main', 'plugins', 'meter'] },
    ],
    [
      'a branch with a slash',
      `${REPO}/tree/feature/x/plugins/meter`,
      { repoUrl: REPO, refAndPath: ['feature', 'x', 'plugins', 'meter'] },
    ],
    [
      "a folder's plugin.json",
      `${REPO}/blob/${SHA}/plugins/meter/.claude-plugin/plugin.json`,
      { repoUrl: REPO, refAndPath: [SHA, 'plugins', 'meter'] },
    ],
    [
      "the root's plugin.json",
      `${REPO}/blob/main/.claude-plugin/plugin.json`,
      { repoUrl: REPO, refAndPath: ['main'] },
    ],
    ['a commit', `${REPO}/commit/${SHA}`, { repoUrl: REPO, refAndPath: [SHA] }],
    ['a short commit', `${REPO}/commit/abc1234`, { repoUrl: REPO, refAndPath: ['abc1234'] }],
  ])('reads %s', (_name, link, expected) => {
    expect(parseModLink(link)).toEqual(expected)
  })

  it.each([
    ['not a URL', 'octocat/mods'],
    ['another host', 'https://gitlab.com/octocat/mods'],
    ['a host that only ends in github.com', 'https://evilgithub.com/octocat/mods'],
    ['credentials in the URL', 'https://me:pw@github.com/octocat/mods'],
    ['a port', 'https://github.com:8443/octocat/mods'],
    ['an owner only', 'https://github.com/octocat'],
    ['an underscore owner', 'https://github.com/octo_cat/mods'],
    ['a dot-dot repository', 'https://github.com/octocat/..'],
    ['an issues page', `${REPO}/issues/1`],
    ['a tree link with no ref', `${REPO}/tree`],
    ['a blob link to another file', `${REPO}/blob/main/README.md`],
    ['a commit link with extra segments', `${REPO}/commit/${SHA}/x`],
    ['a commit link that is not hex', `${REPO}/commit/main`],
    [
      'an encoded "/" that walks up the API path',
      `${REPO}/tree/x%2F..%2F..%2Frepos%2Fvictim%2Fpopular%2Fcommits%2Fmain/plugins/meter`,
    ],
    ['an escape character', `${REPO}/tree/main%1B%5D52/plugins`],
    ['a bidi override', `${REPO}/tree/main%E2%80%AE/plugins`],
  ])('refuses %s', (_name, link) => {
    expect(() => parseModLink(link)).toThrow(/GitHub/)
  })
})

interface FakeOptions {
  repo?: RepoInfo | null
  refs?: Record<string, string>
  onDefaultBranch?: boolean
  manifests?: string[]
}

function fakeGitHub({
  repo = { fullName: 'octocat/mods', license: 'MIT', defaultBranch: 'main' },
  refs = { main: SHA },
  onDefaultBranch = true,
  manifests = ['plugins/meter'],
}: FakeOptions = {}) {
  const calls: string[] = []
  const github: LinkGitHub = {
    async findRepo(repoUrl) {
      calls.push(`repo:${repoUrl}`)
      return repo
    },
    async resolveCommit(_repoUrl, ref) {
      calls.push(`ref:${ref}`)
      return refs[ref] ?? null
    },
    async commitIsOnDefaultBranch(_repoUrl, sha) {
      calls.push(`on-default:${sha}`)
      return onDefaultBranch
    },
    async pluginManifestExists(_repoUrl, path, sha) {
      calls.push(`manifest:${path || '(root)'}@${sha}`)
      return manifests.includes(path)
    },
  }
  return { github, calls }
}

const resolve = (link: string, options?: FakeOptions) => {
  const fake = fakeGitHub(options)
  return { result: resolveModLink(parseModLink(link), fake.github), calls: fake.calls }
}

describe('resolveModLink', () => {
  it('resolves a folder link to the canonical repository, folder and full commit', async () => {
    const { result, calls } = resolve('https://github.com/OctoCat/Mods/tree/main/plugins/meter')

    await expect(result).resolves.toEqual({
      repoUrl: 'https://github.com/octocat/mods',
      owner: 'octocat',
      path: 'plugins/meter',
      ref: 'main',
      commitSha: SHA,
      license: 'MIT',
    })
    expect(calls).toEqual([
      'repo:https://github.com/OctoCat/Mods',
      'ref:main',
      `on-default:${SHA}`,
      `manifest:plugins/meter@${SHA}`,
    ])
  })

  it('reads a repository link as the default branch at its root', async () => {
    const { result } = resolve(REPO, { refs: { main: SHA }, manifests: [''] })

    await expect(result).resolves.toMatchObject({ path: '', ref: 'main', commitSha: SHA })
  })

  it('finds where a branch with a slash ends by asking GitHub', async () => {
    const { result, calls } = resolve(`${REPO}/tree/feature/x/plugins/meter`, {
      refs: { 'feature/x': OTHER },
    })

    await expect(result).resolves.toMatchObject({
      ref: 'feature/x',
      path: 'plugins/meter',
      commitSha: OTHER,
    })
    expect(calls.filter((c) => c.startsWith('ref:'))).toEqual(['ref:feature', 'ref:feature/x'])
  })

  it('expands a short commit to its full hash', async () => {
    const { result } = resolve(`${REPO}/commit/abc1234`, {
      refs: { abc1234: SHA },
      manifests: [''],
    })

    await expect(result).resolves.toMatchObject({ ref: 'abc1234', commitSha: SHA, path: '' })
  })

  it('asks GitHub only about names git allows as a ref', async () => {
    const { result, calls } = resolve(`${REPO}/tree/.hidden/x~1/plugins/meter`, { refs: {} })

    await expect(result).rejects.toMatchObject({ status: 400 })
    expect(calls.filter((c) => c.startsWith('ref:'))).toEqual([])
  })

  it('checks the default branch it already read, without reading the repository again', async () => {
    const fake = fakeGitHub()
    const branches: (string | undefined)[] = []
    const github: LinkGitHub = {
      ...fake.github,
      async commitIsOnDefaultBranch(repoUrl, sha, defaultBranch) {
        branches.push(defaultBranch)
        return fake.github.commitIsOnDefaultBranch(repoUrl, sha, defaultBranch)
      },
    }

    await resolveModLink(parseModLink(`${REPO}/tree/main/plugins/meter`), github)

    expect(branches).toEqual(['main'])
  })

  it('stops looking for a ref after a few tries', async () => {
    const deep = Array.from({ length: 30 }, (_, i) => `d${i}`).join('/')
    const { result, calls } = resolve(`${REPO}/tree/${deep}`, { refs: {} })

    await expect(result).rejects.toMatchObject({ status: 400 })
    expect(calls.filter((c) => c.startsWith('ref:')).length).toBeLessThanOrEqual(5)
  })

  it.each([
    ['a repository GitHub does not have', REPO, { repo: null }, /no public repository/],
    [
      'a ref GitHub does not have',
      `${REPO}/tree/nope/plugins/meter`,
      {},
      /no branch, tag or commit/,
    ],
    [
      'a commit off the default branch',
      `${REPO}/tree/main/plugins/meter`,
      { onDefaultBranch: false },
      /default branch \(main\)/,
    ],
    [
      'a repository root without a plugin',
      REPO,
      { manifests: ['plugins/meter'] },
      /link to the plugin.s folder/,
    ],
    [
      'a folder without a plugin',
      `${REPO}/tree/main/docs`,
      {},
      /no \.claude-plugin\/plugin\.json in docs/,
    ],
    [
      'a folder name the marketplace cannot carry',
      `${REPO}/tree/main/my%20plugin`,
      { manifests: ['my plugin'] },
      /folder/,
    ],
  ])('refuses %s with a 400', async (_name, link, options, message) => {
    const { result } = resolve(link, options as FakeOptions)

    await expect(result).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(message),
    })
  })

  it('refuses a commit GitHub answers with something other than a full hash', async () => {
    const { result } = resolve(`${REPO}/tree/main/plugins/meter`, { refs: { main: 'abc' } })

    await expect(result).rejects.toThrow(/full commit/)
  })
})
