import { readFileSync } from 'node:fs'
import { z } from 'zod'

/** Gate for the dependency mistakes that tests don't catch: a package left behind when its partner
 * was bumped (tailwindcss without @tailwindcss/vite), a 0.x package batched with safe updates
 * (satori 0.26 → 0.47 counts as "minor"), and Bun drifting between the Dockerfile, CI and types. */

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
})

const DependabotGroup = z.object({
  patterns: z.array(z.string()).optional(),
  'exclude-patterns': z.array(z.string()).optional(),
  'update-types': z.array(z.string()).optional(),
})
const DependabotConfig = z.object({
  updates: z.array(
    z.object({
      'package-ecosystem': z.string(),
      groups: z.record(z.string(), DependabotGroup).optional(),
    }),
  ),
})

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function directVersions(pkg: PackageJson): Map<string, string> {
  return new Map(Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }))
}

/** bun.lock is JSON with trailing commas. Its strings (names, versions, hashes) never contain `,}`. */
function parseBunLock(text: string): z.infer<typeof BunLock> {
  return BunLock.parse(JSON.parse(text.replace(/,(\s*[}\]])/g, '$1')))
}

/** A package in the lockfile that needs an exact version of one of our direct dependencies,
 * different from our pin. Bun then installs a second copy for it, and that package keeps running
 * the old one: the bump silently doesn't reach it. Ranges (`^4.5.4`) are left alone. */
export function findPinConflicts(pkg: PackageJson, lockText: string): string[] {
  const direct = directVersions(pkg)
  const out = new Set<string>()
  for (const entry of Object.values(parseBunLock(lockText).packages)) {
    const [id] = entry
    const meta = entry.map((part) => LockEntryMeta.safeParse(part)).find((r) => r.success)?.data
    if (typeof id !== 'string' || !meta) continue
    for (const needs of [meta.dependencies, meta.peerDependencies]) {
      for (const [name, wanted] of Object.entries(needs ?? {})) {
        const pinned = direct.get(name)
        if (pinned && EXACT_VERSION.test(wanted) && wanted !== pinned) {
          out.add(
            `bun.lock: ${id} needs ${name} ${wanted} exactly, but package.json pins ${pinned}. Update them together.`,
          )
        }
      }
    }
  }
  return [...out]
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/** The group Dependabot puts `name` in: of the groups that match and don't exclude it, the one
 * with the most specific pattern (dependabot-core's pattern_specificity_calculator). */
function groupFor(
  name: string,
  groups: Record<string, z.infer<typeof DependabotGroup>>,
): string | undefined {
  let best: { group: string; specificity: number } | undefined
  for (const [group, rule] of Object.entries(groups)) {
    if ((rule['exclude-patterns'] ?? []).some((p) => globToRegExp(p).test(name))) continue
    for (const pattern of rule.patterns ?? []) {
      const specificity = pattern.replaceAll('*', '').length
      if (globToRegExp(pattern).test(name) && (!best || specificity > best.specificity)) {
        best = { group, specificity }
      }
    }
  }
  return best?.group
}

/** Dependabot calls 0.26 → 0.47 a "minor" update, but a 0.x release may break anything
 * (semver.org rule 4). Each 0.x package must come as its own PR, never inside a group that
 * batches minor updates. */
export function findZeroVersionsInBatchGroup(pkg: PackageJson, dependabotYaml: string): string[] {
  const config = DependabotConfig.parse(Bun.YAML.parse(dependabotYaml))
  const groups = config.updates.find((u) => u['package-ecosystem'] === 'bun')?.groups ?? {}
  const out: string[] = []
  for (const [name, version] of directVersions(pkg)) {
    if (!version.startsWith('0.')) continue
    const group = groupFor(name, groups)
    if (group && groups[group]?.['update-types']?.includes('minor')) {
      out.push(
        `.github/dependabot.yml: ${name} ${version} is a 0.x package, so its "minor" updates can break, but it lands in the ${group} group. Add it to that group's exclude-patterns.`,
      )
    }
  }
  return out
}

/** The Bun that builds production (Dockerfile), the one CI tests with, and its types must be one
 * exact version. A floating `oven/bun:1` tag moved production to 1.4.x without anyone deciding to. */
export function findBunVersionDrift(input: {
  dockerfile: string
  ciWorkflow: string
  pkg: PackageJson
}): string[] {
  const types = input.pkg.devDependencies?.['@types/bun']
  const dockerTags = [
    ...new Set([...input.dockerfile.matchAll(/^FROM\s+oven\/bun:(\S+)/gm)].map((m) => m[1])),
  ]
  const floating = dockerTags.filter((tag) => tag !== undefined && !EXACT_VERSION.test(tag))
  if (floating.length) {
    return floating.map(
      (tag) =>
        `Dockerfile: oven/bun:${tag} is not an exact version, so each build can pick up a different Bun. Pin it, e.g. oven/bun:${types ?? 'x.y.z'}.`,
    )
  }
  const ci = input.ciWorkflow.match(/bun-version:\s*(\S+)/)?.[1]
  const all = new Set([...dockerTags, ci, types])
  if (all.size === 1 && !all.has(undefined)) return []
  return [
    `Bun versions disagree: Dockerfile ${dockerTags.join('/') || 'missing'}, CI ${ci ?? 'missing'}, @types/bun ${types ?? 'missing'}. Move all three together.`,
  ]
}

if (!process.env.VITEST) {
  const read = (path: string) => readFileSync(path, 'utf8')
  const pkg = PackageJson.parse(JSON.parse(read('package.json')))
  const problems = [
    ...findPinConflicts(pkg, read('bun.lock')),
    ...findZeroVersionsInBatchGroup(pkg, read('.github/dependabot.yml')),
    ...findBunVersionDrift({
      dockerfile: read('Dockerfile'),
      ciWorkflow: read('.github/workflows/ci.yml'),
      pkg,
    }),
  ]
  if (problems.length) {
    console.error(`Dependency gate failed:\n${problems.map((m) => `  - ${m}`).join('\n')}`)
    process.exit(1)
  }
  console.log('Dependency gate passed.')
}
