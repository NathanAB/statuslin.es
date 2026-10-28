import { PluginRefusal } from './plugin-facts'

/** A .gitattributes past this is refused unread, as is a plugin folder with more of them. */
const GITATTRIBUTES_MAX_BYTES = 64 * 1024
const GITATTRIBUTES_MAX_FILES = 10
/**
 * What a .gitattributes may set: line endings, and how git diffs and merges or GitHub labels a
 * file. Anything else is refused, since some of it makes a checkout depend on the machine's git
 * (filter, working-tree-encoding, a macro…).
 */
const LINE_ENDINGS_ATTRIBUTE =
  /^(?:[-!]?(?:text|binary|crlf|diff|merge|delta|whitespace|linguist-[a-z-]+)(?:=[A-Za-z0-9._,-]+)?|eol=(?:lf|crlf))$/

/** An entry of git's recursive tree of a commit. */
export interface TreeEntry {
  path: string
  type: string
  sha: string
}

/** A blob's bytes, cut at `maxBytes`. */
export type ReadBlob = (
  sha: string,
  maxBytes: number,
) => Promise<{ bytes: Uint8Array; truncated: boolean }>

/**
 * Git skips only these blanks before deciding a line is a comment, so a line starting with any
 * other character (a vertical tab, a non-ASCII space, a byte-order mark) has a pattern. Splitting
 * on a few more is safe: it checks more tokens, never fewer.
 */
const LEADING_BLANKS = /^[ \t\r]+/
const BLANKS = /[ \t\r\f\v]+/

function setsOnlyLineEndings(text: string): boolean {
  return text.split('\n').every((raw) => {
    const line = raw.replace(LEADING_BLANKS, '').trimEnd()
    if (line === '' || line.startsWith('#')) return true
    const [pattern = '', ...attributes] = line.split(BLANKS)
    // A quoted pattern runs straight into its attributes, with no blank to split on; a macro
    // defines attributes of its own.
    if (pattern.startsWith('"') || pattern.startsWith('[attr]')) return false
    return attributes.every((attribute) => LINE_ENDINGS_ATTRIBUTE.test(attribute))
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

export const isAttributesFile = (entry: TreeEntry) =>
  entry.type === 'blob' && named(entry, '.gitattributes')

async function refuseAttributes(sha: string, path: string, readBlob: ReadBlob): Promise<void> {
  const { bytes, truncated } = await readBlob(sha, GITATTRIBUTES_MAX_BYTES)
  if (!truncated && (await blobSha(bytes)) !== sha) {
    throw new Error(`read other bytes than blob ${sha}`)
  }
  // Git reads a byte-order mark as the start of a pattern from a commit, and strips it from a file
  // in the work tree, so both readings must set only line endings.
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
  if (truncated || ![text, text.replace(/^\uFEFF/, '')].every(setsOnlyLineEndings)) {
    throw new PluginRefusal(
      `${path} sets more than line endings, so the checkout statuslin.es inspects can differ from what Claude Code installs`,
    )
  }
}

/**
 * The sandbox inspects a checkout of the plugin folder made with its own git, but Claude Code
 * installs one made with the user's. So refuse what can make the two differ: submodules, and a
 * .gitattributes that sets more than line endings. Each one is read once, after a cap.
 */
export async function refuseArchiveDifferences(
  tree: TreeEntry[],
  readBlob: ReadBlob,
): Promise<void> {
  if (tree.some((entry) => entry.type === 'commit' || named(entry, '.gitmodules'))) {
    throw new PluginRefusal(
      'the plugin folder has git submodules, which statuslin.es cannot inspect',
    )
  }
  const attributes = tree.filter(isAttributesFile)
  if (attributes.length > GITATTRIBUTES_MAX_FILES) {
    throw new PluginRefusal(
      `more than ${GITATTRIBUTES_MAX_FILES} .gitattributes apply to the plugin folder`,
    )
  }
  for (const [sha, path] of new Map(attributes.map((entry) => [entry.sha, entry.path]))) {
    await refuseAttributes(sha, path, readBlob)
  }
}
