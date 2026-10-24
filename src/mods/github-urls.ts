export const GITHUB_API = 'https://api.github.com'
export const GITHUB_ARCHIVES = 'https://codeload.github.com'
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json'

export function repoPath(repoUrl: string): string {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
    repoUrl,
  )
  if (!match || match[2] === '.' || match[2] === '..')
    throw new Error(`"${repoUrl}" is not a https://github.com/<owner>/<repo> URL`)
  return `${match[1]}/${match[2]}`
}

export const repoApiUrl = (repoUrl: string) => `${GITHUB_API}/repos/${repoPath(repoUrl)}`

/**
 * Encodes each part of a "/"-separated ref or path, keeping the "/" GitHub reads between them. A
 * ".", ".." or empty part is refused: fetch would collapse it and walk the request up the API.
 */
export function encodeParts(value: string): string {
  const parts = value.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`"${value}" has an empty, "." or ".." part`)
  }
  return parts.map(encodeURIComponent).join('/')
}

export function manifestUrl(repoUrl: string, path: string, sha: string): string {
  const file = encodeParts(path === '' ? PLUGIN_MANIFEST : `${path}/${PLUGIN_MANIFEST}`)
  return `${repoApiUrl(repoUrl)}/contents/${file}?ref=${sha}`
}
