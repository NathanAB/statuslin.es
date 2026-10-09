const GITHUB_API = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 10_000

export interface GitHub {
  commitIsOnDefaultBranch(repoUrl: string, sha: string): Promise<boolean>
  filesChanged(repoUrl: string, base: string, head: string): Promise<string[]>
  commitIsFetchable(repoUrl: string, sha: string): Promise<boolean>
}

function repoApiUrl(repoUrl: string): string {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
    repoUrl,
  )
  if (!match || match[2] === '.' || match[2] === '..')
    throw new Error(`"${repoUrl}" is not a https://github.com/<owner>/<repo> URL`)
  return `${GITHUB_API}/repos/${match[1]}/${match[2]}`
}

/** `fetchFn` is injected so tests never touch the network. */
export function createGitHub(
  fetchFn: typeof fetch = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): GitHub {
  async function request(url: string, missingStatuses: number[] = []): Promise<unknown | null> {
    const res = await fetchFn(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'statuslin.es' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (missingStatuses.includes(res.status)) return null
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
    return res.json()
  }

  return {
    async commitIsOnDefaultBranch(repoUrl, sha) {
      const repo = repoApiUrl(repoUrl)
      // biome-ignore lint/style/useNamingConvention: GitHub API response field.
      const { default_branch } = (await request(repo)) as { default_branch: string }
      const comparison = (await request(`${repo}/compare/${sha}...${default_branch}`, [404])) as {
        status: string
      } | null
      return comparison?.status === 'ahead' || comparison?.status === 'identical'
    },

    async filesChanged(repoUrl, base, head) {
      const { files } = (await request(`${repoApiUrl(repoUrl)}/compare/${base}...${head}`)) as {
        files: { filename: string }[]
      }
      return files.map((f) => f.filename)
    },

    async commitIsFetchable(repoUrl, sha) {
      return (await request(`${repoApiUrl(repoUrl)}/commits/${sha}`, [404, 422])) !== null
    },
  }
}
