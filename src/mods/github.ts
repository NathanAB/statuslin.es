import { failure, readAtMost, readUpTo } from './github-response'
import { PluginRefusal } from './plugin-facts'

const GITHUB_API = 'https://api.github.com'
const GITHUB_ARCHIVES = 'https://codeload.github.com'
const REQUEST_TIMEOUT_MS = 10_000
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json'

/** Caps on a mod repository's download; every mod the #38 spike rendered fits well inside both. */
export const TARBALL_MAX_BYTES = 20 * 1024 * 1024
export const TARBALL_MAX_FILES = 2_000
/** A JSON answer past this is refused: the largest one read is a compare listing up to 300 files. */
export const GITHUB_JSON_MAX_BYTES = 10 * 1024 * 1024
/** A bare commit hash, with room for a newline. */
const SHA_MAX_BYTES = 64
/** A .gitattributes past this is refused unread. */
const GITATTRIBUTES_MAX_BYTES = 64 * 1024
/** The attributes that drop or rewrite files in GitHub's archive but not in a git checkout. */
const ARCHIVE_ONLY_ATTRIBUTES = /export-(ignore|subst)/i

export interface RepoInfo {
  /** `owner/repo` as GitHub spells it, the canonical form of the repository URL. */
  fullName: string
  /** SPDX id; null for no licence and for GitHub's NOASSERTION. */
  license: string | null
  defaultBranch: string
}

export interface GitHubSource {
  repoInfo(repoUrl: string): Promise<RepoInfo>
  /** Null when GitHub serves no such repository, as for a private one. */
  findRepo(repoUrl: string): Promise<RepoInfo | null>
  /** The full hash a branch, tag or commit names, or null when the repository has no such ref. */
  resolveCommit(repoUrl: string, ref: string): Promise<string | null>
  /** Whether `path` holds `.claude-plugin/plugin.json` at `sha`; '' is the repository root. */
  pluginManifestExists(repoUrl: string, path: string, sha: string): Promise<boolean>
  /**
   * The repository at `sha` as `.tar.gz` bytes: data only, never unpacked on the host. Downloaded
   * once per repository and commit for the life of this source; a failed download stays failed.
   */
  tarball(repoUrl: string, sha: string): Promise<Uint8Array>
  /** The raw README GitHub picks for `path` at `sha`, or null when the folder has none. */
  readme(repoUrl: string, path: string, sha: string): Promise<string | null>
}

export interface GitHub {
  /** `defaultBranch` saves reading the repository when the caller already has it. */
  commitIsOnDefaultBranch(repoUrl: string, sha: string, defaultBranch?: string): Promise<boolean>
  filesChanged(repoUrl: string, base: string, head: string): Promise<string[]>
  commitIsFetchable(repoUrl: string, sha: string): Promise<boolean>
}

interface TreeEntry {
  path: string
  type: string
  sha: string
}

function repoPath(repoUrl: string): string {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
    repoUrl,
  )
  if (!match || match[2] === '.' || match[2] === '..')
    throw new Error(`"${repoUrl}" is not a https://github.com/<owner>/<repo> URL`)
  return `${match[1]}/${match[2]}`
}

/** How much of a README content generation hands the copy-writing agent. */
export const README_MAX_CHARS = 20_000
/** UTF-8 spends at most 3 bytes per UTF-16 unit, so a README cut here still runs past
 * README_MAX_CHARS and gets its cut-off note. */
export const README_MAX_BYTES = 4 * README_MAX_CHARS

const repoApiUrl = (repoUrl: string) => `${GITHUB_API}/repos/${repoPath(repoUrl)}`

/**
 * Encodes each part of a "/"-separated ref or path, keeping the "/" GitHub reads between them. A
 * ".", ".." or empty part is refused: fetch would collapse it and walk the request up the API.
 */
function encodeParts(value: string): string {
  const parts = value.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`"${value}" has an empty, "." or ".." part`)
  }
  return parts.map(encodeURIComponent).join('/')
}

/**
 * `fetchFn` is injected so tests never touch the network. An optional `GITHUB_TOKEN` raises the
 * API's rate limit from 60 to 5,000 requests an hour; it goes to the API host only.
 */
export function createGitHub(
  fetchFn: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): GitHub & GitHubSource {
  const token = process.env.GITHUB_TOKEN
  const send = (url: string, accept = 'application/vnd.github+json') =>
    fetchFn(url, {
      headers: {
        accept,
        'user-agent': 'statuslin.es',
        ...(token && url.startsWith(`${GITHUB_API}/`) && { authorization: `Bearer ${token}` }),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

  async function request(url: string, missingStatuses: number[] = []): Promise<unknown | null> {
    const res = await send(url)
    if (missingStatuses.includes(res.status)) {
      await res.body?.cancel()
      return null
    }
    if (!res.ok) throw failure(res, url)
    return JSON.parse(new TextDecoder().decode(await readAtMost(res, GITHUB_JSON_MAX_BYTES, url)))
  }

  async function findRepo(repoUrl: string): Promise<RepoInfo | null> {
    // biome-ignore-start lint/style/useNamingConvention: GitHub API response fields.
    const repo = (await request(repoApiUrl(repoUrl), [404])) as {
      full_name: string
      default_branch: string
      license: { spdx_id: string | null } | null
      private: boolean
    } | null
    // A token that can read private repositories must not let a submitter probe them.
    if (!repo || repo.private) return null
    const spdx = repo.license?.spdx_id
    return {
      fullName: repo.full_name,
      license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
      defaultBranch: repo.default_branch,
    }
    // biome-ignore-end lint/style/useNamingConvention: GitHub API response fields.
  }

  async function repoInfo(repoUrl: string): Promise<RepoInfo> {
    const repo = await findRepo(repoUrl)
    if (!repo) throw new Error(`GitHub 404 for ${repoApiUrl(repoUrl)}`)
    return repo
  }

  /**
   * The sandbox inspects GitHub's archive of the commit, but Claude Code installs a git checkout of
   * it. So refuse what makes the two differ: submodules, and a .gitattributes that drops or rewrites
   * files in the archive only. One that sets line endings, say, is fine.
   */
  async function refuseArchiveDifferences(repoUrl: string, tree: TreeEntry[]): Promise<void> {
    const named = (entry: TreeEntry, name: string) =>
      entry.path.split('/').at(-1)?.toLowerCase() === name
    if (tree.some((entry) => entry.type === 'commit' || named(entry, '.gitmodules'))) {
      throw new PluginRefusal(
        'the repository has git submodules, which statuslin.es cannot inspect',
      )
    }
    for (const entry of tree.filter((e) => e.type === 'blob' && named(e, '.gitattributes'))) {
      const url = `${repoApiUrl(repoUrl)}/git/blobs/${entry.sha}`
      const res = await send(url, 'application/vnd.github.raw+json')
      if (!res.ok) throw failure(res, url)
      const { bytes, truncated } = await readUpTo(res, GITATTRIBUTES_MAX_BYTES)
      if (truncated || ARCHIVE_ONLY_ATTRIBUTES.test(new TextDecoder().decode(bytes))) {
        throw new PluginRefusal(
          `${entry.path} uses export-ignore or export-subst, so GitHub's archive of the repository differs from what Claude Code installs`,
        )
      }
    }
  }

  async function download(repoUrl: string, sha: string): Promise<Uint8Array> {
    const { truncated, tree } = (await request(
      `${repoApiUrl(repoUrl)}/git/trees/${sha}?recursive=1`,
    )) as { truncated: boolean; tree: TreeEntry[] }
    if (truncated || tree.length > TARBALL_MAX_FILES) {
      throw new Error(`${repoUrl} at ${sha} has more than ${TARBALL_MAX_FILES} files`)
    }
    await refuseArchiveDifferences(repoUrl, tree)
    const url = `${GITHUB_ARCHIVES}/${repoPath(repoUrl)}/tar.gz/${sha}`
    const res = await send(url)
    if (!res.ok) throw failure(res, url)
    return readAtMost(res, TARBALL_MAX_BYTES, url)
  }

  const downloads = new Map<string, Promise<Uint8Array>>()

  return {
    repoInfo,
    findRepo,

    async resolveCommit(repoUrl, ref) {
      const url = `${repoApiUrl(repoUrl)}/commits/${encodeParts(ref)}`
      // The bare hash, not the commit with every file's patch.
      const res = await send(url, 'application/vnd.github.sha')
      if (res.status === 404 || res.status === 422) {
        await res.body?.cancel()
        return null
      }
      if (!res.ok) throw failure(res, url)
      return new TextDecoder().decode((await readUpTo(res, SHA_MAX_BYTES)).bytes).trim()
    },

    async pluginManifestExists(repoUrl, path, sha) {
      const file = encodeParts(path === '' ? PLUGIN_MANIFEST : `${path}/${PLUGIN_MANIFEST}`)
      const url = `${repoApiUrl(repoUrl)}/contents/${file}?ref=${sha}`
      const res = await send(url)
      // Only whether it is there matters, so the file itself is never read.
      await res.body?.cancel()
      if (res.status === 404) return false
      if (!res.ok) throw failure(res, url)
      return true
    },

    async commitIsOnDefaultBranch(repoUrl, sha, defaultBranch) {
      const branch = defaultBranch ?? (await repoInfo(repoUrl)).defaultBranch
      const comparison = (await request(
        `${repoApiUrl(repoUrl)}/compare/${sha}...${encodeURIComponent(branch)}`,
        [404],
      )) as { status: string } | null
      return comparison?.status === 'ahead' || comparison?.status === 'identical'
    },

    async filesChanged(repoUrl, base, head) {
      const { files } = (await request(`${repoApiUrl(repoUrl)}/compare/${base}...${head}`)) as {
        files: { filename: string }[]
      }
      return files.map((f) => f.filename)
    },

    tarball(repoUrl, sha) {
      const key = `${repoPath(repoUrl)}@${sha}`
      const pending = downloads.get(key) ?? download(repoUrl, sha)
      downloads.set(key, pending)
      return pending
    },

    async readme(repoUrl, path, sha) {
      const folder = path ? `/${path}` : ''
      const url = `${repoApiUrl(repoUrl)}/readme${folder}?ref=${sha}`
      const res = await send(url, 'application/vnd.github.raw+json')
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
      return new TextDecoder().decode((await readUpTo(res, README_MAX_BYTES)).bytes)
    },

    async commitIsFetchable(repoUrl, sha) {
      return (await request(`${repoApiUrl(repoUrl)}/commits/${sha}`, [404, 422])) !== null
    },
  }
}
