import type { Sandbox } from 'e2b'
import { refuseArchiveDifferences, type TreeEntry } from '@/mods/archive-differences'
import { repoPath } from '@/mods/github-urls'
import type { FetchPlugin, PinnedSource } from '@/mods/import'
import { E2B_MOD_TEMPLATE_ID } from '../e2b-template'
import { COMMAND_TIMEOUT_MS, readFile, runBounded, withTemplateSandbox } from './mod-sandbox'

/** Caps on a plugin folder; every mod the #38 spike rendered fits well inside both. */
export const TARBALL_MAX_BYTES = 20 * 1024 * 1024
export const TARBALL_MAX_FILES = 2_000
/** A backstop: each command has its own timeout, and the sandbox is killed once the fetch settles. */
const SANDBOX_TIMEOUT_MS = 5 * 60_000
/** Room for the listing of the capped number of paths. */
const OUTPUT_MAX_BYTES = 10 * 1024 * 1024

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

async function sh(sandbox: Sandbox, command: string): Promise<string> {
  const { exitCode, stderr, stdout } = await runBounded(sandbox, command, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    maxOutputBytes: OUTPUT_MAX_BYTES,
  })
  if (exitCode !== 0) throw new Error(`\`${command}\` exited ${exitCode}: ${stderr.trim()}`)
  return stdout.trim()
}

/** A cap compared against NaN would pass, so anything but a count fails. */
function count(output: string): number {
  if (!/^\d+$/.test(output)) throw new Error(`expected a count, got "${output}"`)
  return Number(output)
}

/** `git ls-tree -z` lines: `<mode> <type> <object>\t<path>`. */
function parseTree(listing: string): TreeEntry[] {
  return listing
    .split('\0')
    .filter((line) => line !== '')
    .map((line) => {
      const tab = line.indexOf('\t')
      const [, type = '', sha = ''] = line.slice(0, tab).split(' ')
      return { path: line.slice(tab + 1), type, sha }
    })
}

/** Git applies the .gitattributes of the root and of every folder above `path` to its files too. */
const parentAttributes = (path: string) =>
  path.split('/').map((_, depth, parts) => [...parts.slice(0, depth), '.gitattributes'].join('/'))

/**
 * Claude Code installs a folder plugin with a sparse partial clone, so fetch it the same way: only
 * the folder's files are downloaded, and the caps apply to the folder, not the repository. Every
 * check runs before the checkout writes a file.
 */
async function checkoutPlugin(
  sandbox: Sandbox,
  { repoUrl, path, commitSha }: PinnedSource,
): Promise<Uint8Array> {
  const label = `${repoUrl}${path && ` folder "${path}"`} at ${commitSha}`
  // biome-ignore lint/suspicious/noTemplateCurlyInString: sh expands it.
  const dir = await sh(sandbox, 'mktemp -d "${TMPDIR:-/tmp}/plugin.XXXXXXXX"')
  const inRepo = (command: string) =>
    sh(sandbox, `cd ${quote(`${dir}/repo`)} && export GIT_TERMINAL_PROMPT=0 && ${command}`)
  await sh(sandbox, `git init -q ${quote(`${dir}/repo`)}`)

  const remote = `https://github.com/${repoPath(repoUrl)}`
  const fetched = await inRepo(
    `git remote add origin ${quote(remote)} && git -c protocol.version=2 fetch -q --depth 1 --filter=blob:none origin ${quote(commitSha)} && git rev-parse --verify -q 'FETCH_HEAD^{commit}'`,
  )
  if (fetched !== commitSha) {
    throw new Error(`${commitSha} in ${repoUrl} is not a commit: it names ${fetched}`)
  }

  const folder = path === '' ? '' : ` -- ${quote(path)}`
  const files = count(
    await inRepo(`git ls-tree -r --name-only -z FETCH_HEAD${folder} | tr -cd '\\0' | wc -c`),
  )
  if (files > TARBALL_MAX_FILES) {
    throw new Error(`${label} has more than ${TARBALL_MAX_FILES} files`)
  }

  const parents = path === '' ? '' : ` ${parentAttributes(path).map(quote).join(' ')}`
  const tree = parseTree(await inRepo(`git ls-tree -r -z FETCH_HEAD${folder}${parents}`))
  await refuseArchiveDifferences(tree, async (sha, maxBytes) => {
    const blob = `${dir}/blob-${sha}`
    const size = count(
      await inRepo(
        `git cat-file -s ${quote(sha)} && git cat-file blob ${quote(sha)} | head -c ${maxBytes} > ${quote(blob)}`,
      ),
    )
    return { bytes: await readFile(sandbox, blob), truncated: size > maxBytes }
  })

  const sparse = path === '' ? '' : `git sparse-checkout set --no-cone ${quote(`/${path}/`)} && `
  await inRepo(`${sparse}git -c advice.detachedHead=false checkout -q FETCH_HEAD`)
  const member = path === '' ? '--exclude=repo/.git repo' : quote(`repo/${path}`)
  const bytes = count(
    await sh(
      sandbox,
      `cd ${quote(dir)} && tar czf plugin.tar.gz ${member} && wc -c < plugin.tar.gz`,
    ),
  )
  if (bytes > TARBALL_MAX_BYTES) {
    throw new Error(`${label} is larger than ${TARBALL_MAX_BYTES} bytes`)
  }
  return readFile(sandbox, `${dir}/plugin.tar.gz`)
}

/** Each plugin folder is fetched once per commit for the life of the fetcher; a failure stays failed. */
export function createPluginFetcher(): FetchPlugin {
  const fetched = new Map<string, Promise<Uint8Array>>()
  return (source) => {
    const key = [source.repoUrl, source.path, source.commitSha].join('\0')
    const pending =
      fetched.get(key) ??
      withTemplateSandbox(
        E2B_MOD_TEMPLATE_ID,
        SANDBOX_TIMEOUT_MS,
        (sandbox) => checkoutPlugin(sandbox, source),
        ['github.com'],
      )
    fetched.set(key, pending)
    return pending
  }
}
