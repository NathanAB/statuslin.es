import { PluginRefusal } from './plugin-facts'

/** A .gitattributes past this is refused unread, as is a repository with more of them. */
const GITATTRIBUTES_MAX_BYTES = 64 * 1024
const GITATTRIBUTES_MAX_FILES = 10
/**
 * What a .gitattributes may set: line endings, and how git diffs and merges or GitHub labels a
 * file. Anything else can make GitHub's archive differ from the checkout Claude Code installs
 * (export-ignore, export-subst, working-tree-encoding, filter, ident, a macro…).
 */
const LINE_ENDINGS_ATTRIBUTE =
  /^(?:[-!]?(?:text|binary|crlf|diff|merge|delta|whitespace|linguist-[a-z-]+)(?:=[A-Za-z0-9._,-]+)?|eol=(?:lf|crlf))$/

/** An entry of GitHub's recursive tree of a commit. */
export interface TreeEntry {
  path: string
  type: string
  sha: string
}

/** A blob's bytes as GitHub serves them, cut at `maxBytes`. */
export type ReadBlob = (
  sha: string,
  maxBytes: number,
) => Promise<{ bytes: Uint8Array; truncated: boolean }>

function setsOnlyLineEndings(text: string): boolean {
  return text.split('\n').every((line) => {
    const [pattern, ...attributes] = line.trim().split(/\s+/)
    if (!pattern || pattern.startsWith('#')) return true
    return !pattern.startsWith('[attr]') && attributes.every((a) => LINE_ENDINGS_ATTRIBUTE.test(a))
  })
}

/** Git's id for a file's bytes, which the repository tree lists it by. */
async function blobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`)
  const digest = await crypto.subtle.digest('SHA-1', new Uint8Array([...header, ...bytes]))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const named = (entry: TreeEntry, name: string) =>
  entry.path.split('/').at(-1)?.toLowerCase() === name

async function refuseAttributes(sha: string, path: string, readBlob: ReadBlob): Promise<void> {
  const { bytes, truncated } = await readBlob(sha, GITATTRIBUTES_MAX_BYTES)
  if (!truncated && (await blobSha(bytes)) !== sha) {
    throw new Error(`GitHub sent other bytes than blob ${sha}`)
  }
  if (truncated || !setsOnlyLineEndings(new TextDecoder().decode(bytes))) {
    throw new PluginRefusal(
      `${path} sets more than line endings, so GitHub's archive of the repository can differ from what Claude Code installs`,
    )
  }
}

/**
 * The sandbox inspects GitHub's archive of the commit, but Claude Code installs a git checkout of
 * it. So refuse what makes the two differ: submodules, and a .gitattributes that sets more than
 * line endings. Each one is read once, after a cap, so a repository can't spend the token.
 */
export async function refuseArchiveDifferences(
  tree: TreeEntry[],
  readBlob: ReadBlob,
): Promise<void> {
  if (tree.some((entry) => entry.type === 'commit' || named(entry, '.gitmodules'))) {
    throw new PluginRefusal('the repository has git submodules, which statuslin.es cannot inspect')
  }
  const attributes = tree.filter((entry) => entry.type === 'blob' && named(entry, '.gitattributes'))
  if (attributes.length > GITATTRIBUTES_MAX_FILES) {
    throw new PluginRefusal(
      `the repository has more than ${GITATTRIBUTES_MAX_FILES} .gitattributes`,
    )
  }
  for (const [sha, path] of new Map(attributes.map((entry) => [entry.sha, entry.path]))) {
    await refuseAttributes(sha, path, readBlob)
  }
}
