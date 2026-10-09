// biome-ignore-all lint/style/useNamingConvention: keys mirror the GitHub REST API JSON contract.
const GITHUB_API = 'https://api.github.com'

/** The GitHub facts the mod scripts check, behind an injected fetch so tests never touch the network. */
export interface GitHub {
  commitIsOnDefaultBranch(repoUrl: string, sha: string): Promise<boolean>
  filesChanged(repoUrl: string, base: string, head: string): Promise<string[]>
  commitIsFetchable(repoUrl: string, sha: string): Promise<boolean>
}

function repoApiUrl(repoUrl: string): string {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(repoUrl)
  if (!match) throw new Error(`"${repoUrl}" is not a https://github.com/<owner>/<repo> URL`)
  return `${GITHUB_API}/repos/${match[1]}/${match[2]}`
}

export function createGitHub(fetchFn: typeof fetch = fetch): GitHub {
  async function request(url: string, missingStatuses: number[] = []): Promise<unknown | null> {
    const res = await fetchFn(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'statuslin.es' },
    })
    if (missingStatuses.includes(res.status)) return null
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
    return res.json()
  }

  return {
    async commitIsOnDefaultBranch(repoUrl, sha) {
      const repo = repoApiUrl(repoUrl)
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
