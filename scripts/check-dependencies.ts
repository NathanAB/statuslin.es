import { readFileSync } from 'node:fs'
import { z } from 'zod'

/** Gate for the dependency mistakes that tests don't catch: a package left behind when its partner
 * was bumped (tailwindcss without @tailwindcss/vite), a 0.x package batched with unrelated updates
 * (satori 0.26 → 0.47 counts as "minor"), and Bun drifting between the Dockerfile, CI and types.
 * The check functions take parsed data; only the entry point below reads and parses files, so the
 * tests also run under Node (CI's coverage run). */

const Versions = z.record(z.string(), z.string())
const PackageJson = z.object({
  dependencies: Versions.optional(),
  devDependencies: Versions.optional(),
})
type PackageJson = z.infer<typeof PackageJson>

// A bun.lock entry is [`name@version`, registry, { dependencies, peerDependencies, … }, integrity].
const BunLock = z.object({ packages: z.record(z.string(), z.array(z.unknown())) })
const LockEntryMeta = z.object({
  dependencies: Versions.optional(),
  peerDependencies: Versions.optional(),
  optionalDependencies: Versions.optional(),
})

const DependabotGroup = z.object({
  patterns: z.array(z.string()).optional(),
  'exclude-patterns': z.array(z.string()).optional(),
  'update-types': z.array(z.string()).optional(),
  'dependency-type': z.enum(['production', 'development']).optional(),
  'applies-to': z.enum(['version-updates', 'security-updates']).optional(),
})
type DependabotGroup = z.infer<typeof DependabotGroup>
const DependabotConfig = z.object({
  updates: z.array(
    z.object({
      'package-ecosystem': z.string(),
      groups: z.record(z.string(), DependabotGroup).optional(),
    }),
  ),
})

const CiWorkflow = z.object({
  jobs: z.record(
    z.string(),
    z.object({
      steps: z
        .array(
          z.object({
            uses: z.string().optional(),
            with: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .optional(),
    }),
  ),
})

/** `1.2.3`, `=1.2.3`, `1.2.3-beta.1`, `1.2.3+build`. Captures the version without `=` or build. */
const EXACT_VERSION = /^=?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?$/

function exactVersion(spec: string): string | undefined {
  return spec.match(EXACT_VERSION)?.[1]
}

/** The part of a version that signals breaking changes: the major, or major.minor below 1.0. */
function breakingLine(version: string): string {
  const [major, minor] = version.split('.')
  return major === '0' ? `0.${minor}` : `${major}`
}

/** bun.lock is JSON with trailing commas. Its strings (names, versions, hashes) never contain `,}`. */
function parseBunLock(text: string): z.infer<typeof BunLock> {
  return BunLock.parse(JSON.parse(text.replace(/,(\s*[}\]])/g, '$1')))
}

/** A package in the lockfile that needs an exact version of one of our direct dependencies, on
 * the same major as our pin but different. Bun then installs a second copy for it, and that package
 * keeps running the old one: the bump silently doesn't reach it. Ranges (`^4.5.4`) and pins on
 * another major are left alone, since updating together couldn't fix them. */
export function findPinConflicts(pkg: PackageJson, lockText: string): string[] {
  const direct = new Map(
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).flatMap(([name, spec]) => {
      const version = exactVersion(spec)
      return version ? [[name, version] as const] : []
    }),
  )
  const out = new Set<string>()
  for (const entry of Object.values(parseBunLock(lockText).packages)) {
    const [id] = entry
    const meta = entry.map((part) => LockEntryMeta.safeParse(part)).find((r) => r.success)?.data
    if (typeof id !== 'string' || !meta) continue
    for (const needs of [meta.dependencies, meta.peerDependencies, meta.optionalDependencies]) {
      for (const [name, spec] of Object.entries(needs ?? {})) {
        const pinned = direct.get(name)
        const wanted = exactVersion(spec)
        if (
          pinned &&
          wanted &&
          wanted !== pinned &&
          breakingLine(wanted) === breakingLine(pinned)
        ) {
          out.add(
            `bun.lock: ${id} needs ${name} ${wanted} exactly, but package.json pins ${pinned}. Update them together.`,
          )
        }
      }
    }
  }
  return [...out]
}

function matchesGlob(pattern: string, name: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(name)
}

/** dependabot-core's PatternSpecificityCalculator scores, for the pattern that matched. */
function patternScore(pattern: string, name: string): number {
  if (pattern === name) return 1000
  if (pattern === '*') return 1
  const wildcards = pattern.split('*').length - 1
  if (wildcards === 0) return 500
  return Math.max(100 - wildcards * 10 + Math.max(pattern.length - 5, 0), 1)
}

/** How strongly `group` claims a minor version update of `name`, or 0 when it doesn't take it.
 * Mirrors dependabot-core: a group without patterns matches every package of its dependency type
 * and scores 500. */
function claimScore(
  group: DependabotGroup,
  dependency: { name: string; type: 'production' | 'development' },
): number {
  if (group['applies-to'] === 'security-updates') return 0
  if (group['update-types'] && !group['update-types'].includes('minor')) return 0
  if (group['dependency-type'] && group['dependency-type'] !== dependency.type) return 0
  if ((group['exclude-patterns'] ?? []).some((p) => matchesGlob(p, dependency.name))) return 0
  if (!group.patterns) return 500
  const scores = group.patterns
    .filter((p) => matchesGlob(p, dependency.name))
    .map((p) => patternScore(p, dependency.name))
  return Math.max(0, ...scores)
}

/** Dependabot calls 0.26 → 0.47 a "minor" update, but a 0.x release may break anything
 * (semver.org rule 4). A 0.x package may share a PR only with the packages a group names on
 * purpose, never in a group that catches everything (`*`, or no patterns). */
export function findZeroVersionsInBatchGroup(
  pkg: PackageJson,
  dependabotConfig: unknown,
): string[] {
  const bun = DependabotConfig.parse(dependabotConfig).updates.find(
    (u) => u['package-ecosystem'] === 'bun',
  )
  if (!bun) {
    return [
      ".github/dependabot.yml: no bun entry, so check:deps can't see which group each package lands in.",
    ]
  }
  const groups = Object.entries(bun.groups ?? {})
  return directDependencies(pkg)
    .filter((dependency) => exactVersion(dependency.version)?.startsWith('0.'))
    .flatMap((dependency) => {
      const winner = winningGroup(groups, dependency)
      // Claimed through a bare `*` (score 1) or by a group with no patterns at all.
      if (!winner || (winner.score !== 1 && winner.group.patterns)) return []
      return [
        `.github/dependabot.yml: ${dependency.name} ${dependency.version} is a 0.x package, so its "minor" updates can break, but they land in the ${winner.name} group with unrelated packages. Add it to that group's exclude-patterns.`,
      ]
    })
}

function directDependencies(pkg: PackageJson) {
  return [
    ...Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({
      name,
      version,
      type: 'production' as const,
    })),
    ...Object.entries(pkg.devDependencies ?? {}).map(([name, version]) => ({
      name,
      version,
      type: 'development' as const,
    })),
  ]
}

/** The group that takes a minor update of `dependency`: the highest score wins, and on a tie the
 * group listed first keeps it. */
function winningGroup(
  groups: [string, DependabotGroup][],
  dependency: { name: string; type: 'production' | 'development' },
) {
  let winner: { name: string; group: DependabotGroup; score: number } | undefined
  for (const [name, group] of groups) {
    const score = claimScore(group, dependency)
    if (score > (winner?.score ?? 0)) winner = { name, group, score }
  }
  return winner
}

/** `FROM [--flag…] [docker.io/]oven/bun[:tag][@digest]`, case-insensitive like Docker. */
const BUN_IMAGE =
  /^\s*FROM\s+(?:--\S+\s+)*((?:(?:index\.)?docker\.io\/)?oven\/bun(?::([^\s@]+))?(?:@\S+)?)/gim
/** An exact Bun version tag, optionally with an image variant: `1.4.3`, `1.4.3-alpine`. */
const EXACT_TAG = /^(\d+\.\d+\.\d+)(?:-[a-z0-9.-]+)?$/

/** The Bun that builds production (Dockerfile), the one every CI job tests with, its types, and the
 * Bun running this check must be one exact version. A floating `oven/bun:1` tag moved production to
 * 1.4.x without anyone deciding to. */
export function findBunVersionDrift(input: {
  dockerfile: string
  ciWorkflow: unknown
  pkg: PackageJson
  runningBun: string
}): string[] {
  const images = [...input.dockerfile.matchAll(BUN_IMAGE)].map(([, ref = '', tag = '']) => ({
    ref: ref.replace(/@\S+$/, ''),
    version: tag.match(EXACT_TAG)?.[1],
  }))
  const floating = images.filter((image) => !image.version)
  const ciSpecs = Object.values(CiWorkflow.parse(input.ciWorkflow).jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses?.startsWith('oven-sh/setup-bun'))
    .map((step) => step.with?.['bun-version'])
  const ciVersions = ciSpecs.map((spec) =>
    typeof spec === 'string' ? exactVersion(spec) : undefined,
  )

  const out = [...new Set(floating.map((image) => image.ref))].map(
    (ref) =>
      `Dockerfile: ${ref} is not an exact Bun version, so each build can pick up a different Bun. Pin the version it resolves to today (docker buildx imagetools inspect ${ref}).`,
  )
  if (ciVersions.some((v) => !v)) {
    out.push(
      '.github/workflows/ci.yml: a setup-bun step has no exact bun-version, so CI can test on a different Bun. Pin it.',
    )
  }
  if (out.length) return out

  const docker = [...new Set(images.map((image) => image.version))]
  const ci = [...new Set(ciVersions)]
  const types = input.pkg.devDependencies?.['@types/bun']
  if (new Set([...docker, ...ci, types]).size !== 1 || !docker.length || !ci.length || !types) {
    return [
      `Bun versions disagree: Dockerfile ${docker.join('/') || 'missing'}, CI ${ci.join('/') || 'missing'}, @types/bun ${types ?? 'missing'}. Move all three together.`,
    ]
  }
  if (input.runningBun !== types) {
    return [
      `This is Bun ${input.runningBun}, but the project pins ${types}. Install it: curl -fsSL https://bun.com/install | bash -s "bun-v${types}"`,
    ]
  }
  return []
}

if (!process.env.VITEST) {
  const read = (path: string) => readFileSync(path, 'utf8')
  const pkg = PackageJson.parse(JSON.parse(read('package.json')))
  const problems = [
    ...findPinConflicts(pkg, read('bun.lock')),
    ...findZeroVersionsInBatchGroup(pkg, Bun.YAML.parse(read('.github/dependabot.yml'))),
    ...findBunVersionDrift({
      dockerfile: read('Dockerfile'),
      ciWorkflow: Bun.YAML.parse(read('.github/workflows/ci.yml')),
      pkg,
      runningBun: Bun.version,
    }),
  ]
  if (problems.length) {
    console.error(`Dependency gate failed:\n${problems.map((m) => `  - ${m}`).join('\n')}`)
    process.exit(1)
  }
  console.log('Dependency gate passed.')
}
