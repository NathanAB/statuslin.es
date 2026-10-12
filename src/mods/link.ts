import { HttpError } from '@/lib/http'
import { COMMIT_SHA, pluginPathSchema } from './curation'
import type { GitHub, GitHubSource } from './github'

/** A GitHub link to a mod as typed, before GitHub says where its ref ends. */
export interface ParsedModLink {
  /** `https://github.com/<owner>/<repo>`, spelled as the link spells it. */
  repoUrl: string
  /**
   * The ref then the folder, joined. A branch name may hold a "/", so only GitHub can say where the
   * ref ends. Empty for a repository link, which means the default branch at the root.
   */
  refAndPath: string[]
}

/** A mod's source pinned to a commit, ready to import. */
export interface ResolvedModLink {
  /** Canonical, as GitHub spells it. */
  repoUrl: string
  owner: string
  /** The folder holding `.claude-plugin/plugin.json`; '' for the repository root. */
  path: string
  /** The branch, tag or commit the link named, or the default branch. */
  ref: string
  commitSha: string
  license: string | null
}

export type LinkGitHub = Pick<
  GitHub & GitHubSource,
  'findRepo' | 'resolveCommit' | 'commitIsOnDefaultBranch' | 'pluginManifestExists'
>

const HOSTS = new Set(['github.com', 'www.github.com'])
const OWNER = /^[A-Za-z0-9-]+$/
const REPO = /^[A-Za-z0-9._-]+$/
const SHORT_SHA = /^[0-9a-f]{7,40}$/i
const MANIFEST = ['.claude-plugin', 'plugin.json']
/** Each try is a GitHub request; branch names rarely hold more than a couple of "/". */
const MAX_REF_TRIES = 5

const refuse = (message: string) => new HttpError(400, message)
const NOT_A_MOD_LINK =
  'Paste a link to a GitHub repository, the plugin’s folder, its .claude-plugin/plugin.json, or a commit.'

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw refuse(NOT_A_MOD_LINK)
  }
}

/** The ref and folder a link names after its repository, or null for a page that isn't one. */
function refAndPathOf(kind: string | undefined, rest: string[]): string[] | null {
  if (kind === undefined) return []
  if (kind === 'tree') return rest.length > 0 ? rest : null
  if (kind === 'blob') {
    const tail = rest.slice(-MANIFEST.length)
    const named = rest.length > MANIFEST.length && tail.every((s, i) => s === MANIFEST[i])
    return named ? rest.slice(0, -MANIFEST.length) : null
  }
  if (kind === 'commit') return rest.length === 1 && SHORT_SHA.test(rest[0] ?? '') ? rest : null
  return null
}

export function parseModLink(input: string): ParsedModLink {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw refuse(NOT_A_MOD_LINK)
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !HOSTS.has(url.hostname) ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw refuse(NOT_A_MOD_LINK)
  }
  const [owner = '', rawRepo = '', kind, ...rest] = url.pathname
    .split('/')
    .filter((s) => s !== '')
    .map(decoded)
  const repo = rawRepo.replace(/\.git$/, '')
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') {
    throw refuse(NOT_A_MOD_LINK)
  }
  const refAndPath = refAndPathOf(kind, rest)
  if (refAndPath === null) throw refuse(NOT_A_MOD_LINK)
  return { repoUrl: `https://github.com/${owner}/${repo}`, refAndPath }
}

/** The shortest prefix of `refAndPath` GitHub knows as a ref, with the folder after it. */
async function splitRef(
  github: LinkGitHub,
  repoUrl: string,
  refAndPath: string[],
): Promise<{ ref: string; path: string; sha: string }> {
  const tries = Math.min(refAndPath.length, MAX_REF_TRIES)
  for (let i = 1; i <= tries; i++) {
    const ref = refAndPath.slice(0, i).join('/')
    const sha = await github.resolveCommit(repoUrl, ref)
    if (sha !== null) return { ref, path: refAndPath.slice(i).join('/'), sha }
  }
  throw refuse('GitHub has no branch, tag or commit named in that link.')
}

/**
 * Pins the link to a full commit on the repository's default branch, and checks the folder holds a
 * plugin. A commit only in a fork is served through the parent's URL too, so the default-branch
 * check is what ties the code to the linked repository (ADR 0005).
 */
export async function resolveModLink(
  link: ParsedModLink,
  github: LinkGitHub,
): Promise<ResolvedModLink> {
  const repo = await github.findRepo(link.repoUrl)
  if (!repo) throw refuse(`GitHub has no public repository at ${link.repoUrl}.`)
  const repoUrl = `https://github.com/${repo.fullName}`
  const named = link.refAndPath.length === 0 ? [repo.defaultBranch] : link.refAndPath
  const { ref, path, sha } = await splitRef(github, repoUrl, named)
  if (!COMMIT_SHA.test(sha)) {
    throw new Error(`GitHub answered ${ref} with "${sha}", not a full commit hash`)
  }
  if (!pluginPathSchema.safeParse(path).success) {
    throw refuse('The plugin’s folder must be named with letters, digits, ".", "_" and "-" only.')
  }
  if (!(await github.commitIsOnDefaultBranch(repoUrl, sha))) {
    throw refuse(
      `Commit ${sha.slice(0, 7)} isn’t on the repository’s default branch (${repo.defaultBranch}). Link to a commit on it.`,
    )
  }
  if (!(await github.pluginManifestExists(repoUrl, path, sha))) {
    throw refuse(
      path === ''
        ? 'The repository root has no .claude-plugin/plugin.json: link to the plugin’s folder.'
        : `There’s no .claude-plugin/plugin.json in ${path}: link to the plugin’s folder.`,
    )
  }
  const owner = repo.fullName.slice(0, repo.fullName.indexOf('/'))
  return { repoUrl, owner, path, ref, commitSha: sha, license: repo.license }
}
