const GITHUB_API = 'https://api.github.com'
const GITHUB_ARCHIVES = 'https://codeload.github.com'
const REQUEST_TIMEOUT_MS = 10_000

/** Caps on a mod repository's download; every mod the #38 spike rendered fits well inside both. */
export const TARBALL_MAX_BYTES = 20 * 1024 * 1024
export const TARBALL_MAX_FILES = 2_000

export interface RepoInfo {
  /** `owner/repo` as GitHub spells it, the canonical form of the repository URL. */
  fullName: string
  /** SPDX id; null for no licence and for GitHub's NOASSERTION. */
  license: string | null
  defaultBranch: string
}

export interface GitHubSource {
  repoInfo(repoUrl: string): Promise<RepoInfo>
  /**
   * The repository at `sha` as `.tar.gz` bytes: data only, never unpacked on the host. Downloaded
   * once per repository and commit for the life of this source; a failed download stays failed.
   */
  tarball(repoUrl: string, sha: string): Promise<Uint8Array>
  /** The raw README GitHub picks for `path` at `sha`, or null when the folder has none. */
  readme(repoUrl: string, path: string, sha: string): Promise<string | null>
}

export interface GitHub {
  commitIsOnDefaultBranch(repoUrl: string, sha: string): Promise<boolean>
  filesChanged(repoUrl: string, base: string, head: string): Promise<string[]>
  commitIsFetchable(repoUrl: string, sha: string): Promise<boolean>
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

/** The first `maxBytes` of the body (or all of it), cancelling the rest unread. */
async function readUpTo(
  res: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
    if (size + chunk.value.byteLength > maxBytes) {
      chunks.push(chunk.value.subarray(0, maxBytes - size))
      size = maxBytes
      truncated = true
      await reader?.cancel()
      break
    }
    size += chunk.value.byteLength
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, truncated }
}

async function readAtMost(res: Response, maxBytes: number, url: string): Promise<Uint8Array> {
  const tooLarge = () => new Error(`${url} is larger than ${maxBytes} bytes`)
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge()
  const { bytes, truncated } = await readUpTo(res, maxBytes)
  if (truncated) throw tooLarge()
  return bytes
}

/** `fetchFn` is injected so tests never touch the network. */
export function createGitHub(
  fetchFn: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): GitHub & GitHubSource {
  const send = (url: string, accept = 'application/vnd.github+json') =>
    fetchFn(url, {
      headers: { accept, 'user-agent': 'statuslin.es' },
      signal: AbortSignal.timeout(timeoutMs),
    })

  async function request(url: string, missingStatuses: number[] = []): Promise<unknown | null> {
    const res = await send(url)
    if (missingStatuses.includes(res.status)) return null
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
    return res.json()
  }

  async function repoInfo(repoUrl: string): Promise<RepoInfo> {
    // biome-ignore-start lint/style/useNamingConvention: GitHub API response fields.
    const repo = (await request(repoApiUrl(repoUrl))) as {
      full_name: string
      default_branch: string
      license: { spdx_id: string | null } | null
    }
    const spdx = repo.license?.spdx_id
    return {
      fullName: repo.full_name,
      license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
      defaultBranch: repo.default_branch,
    }
    // biome-ignore-end lint/style/useNamingConvention: GitHub API response fields.
  }

  async function download(repoUrl: string, sha: string): Promise<Uint8Array> {
    const { truncated, tree } = (await request(
      `${repoApiUrl(repoUrl)}/git/trees/${sha}?recursive=1`,
    )) as { truncated: boolean; tree: unknown[] }
    if (truncated || tree.length > TARBALL_MAX_FILES) {
      throw new Error(`${repoUrl} at ${sha} has more than ${TARBALL_MAX_FILES} files`)
    }
    const url = `${GITHUB_ARCHIVES}/${repoPath(repoUrl)}/tar.gz/${sha}`
    const res = await send(url)
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
    return readAtMost(res, TARBALL_MAX_BYTES, url)
  }

  const downloads = new Map<string, Promise<Uint8Array>>()

  return {
    repoInfo,

    async commitIsOnDefaultBranch(repoUrl, sha) {
      const { defaultBranch } = await repoInfo(repoUrl)
      const comparison = (await request(
        `${repoApiUrl(repoUrl)}/compare/${sha}...${encodeURIComponent(defaultBranch)}`,
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
