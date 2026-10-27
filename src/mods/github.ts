import { failure, readAtMost, readJsonObject, readUpTo } from './github-response'
import { encodeParts, GITHUB_API, manifestUrl, repoApiUrl } from './github-urls'

const REQUEST_TIMEOUT_MS = 10_000

/** A JSON answer past this is refused: the largest one read is a compare listing up to 300 files. */
export const GITHUB_JSON_MAX_BYTES = 10 * 1024 * 1024
/** A bare commit hash, with room for a newline. */
const SHA_MAX_BYTES = 64
export const PLUGIN_MANIFEST_MAX_BYTES = 64 * 1024
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
  /** The `version` string in `path`'s plugin.json at `sha`; null when absent or past 64 KiB. */
  pluginVersion(repoUrl: string, path: string, sha: string): Promise<string | null>
  /** The `description` in `path`'s plugin.json at `sha`, '' when it has none; null when unreadable. */
  pluginDescription(repoUrl: string, path: string, sha: string): Promise<string | null>
  /** The raw README GitHub picks for `path` at `sha`, or null when the folder has none. */
  readme(repoUrl: string, path: string, sha: string): Promise<string | null>
}

/** How GitHub's compare places a head commit against a base: 'ahead' when it builds on the base. */
export type CommitComparison = 'ahead' | 'behind' | 'diverged' | 'identical'

export interface GitHub {
  /** `defaultBranch` saves reading the repository when the caller already has it. */
  commitIsOnDefaultBranch(repoUrl: string, sha: string, defaultBranch?: string): Promise<boolean>
  filesChanged(repoUrl: string, base: string, head: string): Promise<string[]>
  compareCommits(repoUrl: string, base: string, head: string): Promise<CommitComparison>
  commitIsFetchable(repoUrl: string, sha: string): Promise<boolean>
}

/** How much of a README content generation hands the copy-writing agent. */
export const README_MAX_CHARS = 20_000
/** UTF-8 spends at most 3 bytes per UTF-16 unit, so a README cut here still runs past
 * README_MAX_CHARS and gets its cut-off note. */
export const README_MAX_BYTES = 4 * README_MAX_CHARS

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

  /** plugin.json at `sha`, or null when it is missing, past 64 KiB or not a JSON object. */
  async function readManifest(
    repoUrl: string,
    path: string,
    sha: string,
  ): Promise<Record<string, unknown> | null> {
    const url = manifestUrl(repoUrl, path, sha)
    const res = await send(url, 'application/vnd.github.raw+json')
    if (res.status === 404) return null
    if (!res.ok) throw failure(res, url)
    return readJsonObject(res, PLUGIN_MANIFEST_MAX_BYTES)
  }

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
      const url = manifestUrl(repoUrl, path, sha)
      const res = await send(url)
      // Only whether it is there matters, so the file itself is never read.
      await res.body?.cancel()
      if (res.status === 404) return false
      if (!res.ok) throw failure(res, url)
      return true
    },

    async pluginVersion(repoUrl, path, sha) {
      const manifest = await readManifest(repoUrl, path, sha)
      return typeof manifest?.version === 'string' ? manifest.version : null
    },

    async pluginDescription(repoUrl, path, sha) {
      const manifest = await readManifest(repoUrl, path, sha)
      if (!manifest) return null
      const { description = '' } = manifest
      return typeof description === 'string' ? description : null
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

    async compareCommits(repoUrl, base, head) {
      const { status } = (await request(`${repoApiUrl(repoUrl)}/compare/${base}...${head}`)) as {
        status: CommitComparison
      }
      return status
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
