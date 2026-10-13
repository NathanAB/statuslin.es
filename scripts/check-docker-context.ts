/**
 * Fail when the Docker build context would ship a file git ignores.
 *
 * The Dockerfile copies the whole context into the runtime image, so anything .dockerignore misses
 * (nested worktrees with their .env.local, private notes) ends up in the deployed image. Docker's
 * ignore patterns are not recursive the way git's are, so the two files drift. This asks Docker for
 * the real context and git for its verdict on each file, instead of re-implementing either matcher.
 *
 *   bun run scripts/check-docker-context.ts [dir]   # dir defaults to the current directory
 *
 * Needs a running Docker daemon. `bun run deploy:staging` runs it before every build.
 */
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LISTING_DOCKERFILE = 'FROM scratch\nCOPY . /\n'
const MAX_LISTING_BYTES = 256 * 1024 * 1024

/** Every file a `docker build` of `dir` would see, relative to `dir`, after .dockerignore. */
export async function listBuildContext(dir: string): Promise<string[]> {
  const out = await mkdtemp(join(tmpdir(), 'docker-context-'))
  const archive = join(out, 'context.tar')
  try {
    // A tar export, not type=local: writing tens of thousands of small files out takes minutes.
    const build = spawnSync(
      'docker',
      ['build', '--quiet', '--file', '-', '--output', `type=tar,dest=${archive}`, dir],
      { input: LISTING_DOCKERFILE, encoding: 'utf8' },
    )
    if (build.status !== 0) throw new Error(`docker build failed: ${build.stderr || build.error}`)
    return listArchive(archive)
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}

/** The file paths inside a tar archive. */
export function listArchive(archive: string): string[] {
  const listing = spawnSync('tar', ['-tf', archive], {
    // Without a UTF-8 locale tar prints non-ASCII names as octal escapes, which git can't match.
    // biome-ignore lint/style/useNamingConvention: environment variable name.
    env: { ...process.env, LC_ALL: 'C.UTF-8' },
    encoding: 'utf8',
    maxBuffer: MAX_LISTING_BYTES,
  })
  if (listing.status !== 0) throw new Error(`tar failed: ${listing.stderr || listing.error}`)
  return listing.stdout.split('\n').filter((entry) => entry !== '' && !entry.endsWith('/'))
}

/** The subset of `files` (relative to the git repo at `dir`) that git ignores. Tracked files never count. */
export function findGitIgnored(dir: string, files: string[]): string[] {
  const result = spawnSync('git', ['-C', dir, 'check-ignore', '--stdin', '-z'], {
    input: files.join('\0'),
    encoding: 'utf8',
    maxBuffer: MAX_LISTING_BYTES,
  })
  if (result.status === 1) return []
  if (result.status !== 0) throw new Error(`git check-ignore failed: ${result.stderr}`)
  return result.stdout.split('\0').filter(Boolean)
}

export function describeLeaks(leaked: string[]): string {
  const byTopLevel = new Map<string, string[]>()
  for (const path of leaked) {
    const top = path.split('/')[0] ?? path
    const group = byTopLevel.get(top)
    if (group) group.push(path)
    else byTopLevel.set(top, [path])
  }
  const lines = [...byTopLevel].map(([top, paths]) => {
    const count = paths.length === 1 ? '1 file' : `${paths.length} files`
    return `  ${top}  ${count}, e.g. ${paths[0]}`
  })
  return [
    `The Docker build context ships ${leaked.length} git-ignored files. Add these to .dockerignore:`,
    ...lines,
  ].join('\n')
}

export async function assertBuildContextClean(dir: string): Promise<void> {
  const leaked = findGitIgnored(dir, await listBuildContext(dir))
  if (leaked.length > 0) throw new Error(describeLeaks(leaked))
}

if (import.meta.main) {
  try {
    await assertBuildContextClean(process.argv[2] ?? process.cwd())
    console.log('Docker build context ships no git-ignored files.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
