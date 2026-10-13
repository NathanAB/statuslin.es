import { describe, expect, it } from 'vitest'
import {
  findBunVersionDrift,
  findPinConflicts,
  findZeroVersionsInBatchGroup,
} from '../../scripts/check-dependencies'

// bun.lock is JSON with trailing commas.
const LOCK = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "app",
    },
  },
  "packages": {
    "@tailwindcss/vite": ["@tailwindcss/vite@4.3.0", "", { "dependencies": { "tailwindcss": "4.3.0" } }, "sha512-a"],
    "better-auth": ["better-auth@1.7.7", "", { "dependencies": { "zod": "^4.5.4" } }, "sha512-b"],
    "legacy-forms": ["legacy-forms@2.0.0", "", { "dependencies": { "zod": "3.23.8" } }, "sha512-c"],
    "old-cards": ["old-cards@1.0.0", "", { "dependencies": { "satori": "0.25.0" } }, "sha512-d"],
    "widget-react": ["widget-react@2.1.0", "", { "peerDependencies": { "widget-core": "=2.1.0" }, "optionalDependencies": { "widget-native": "2.1.0" } }, "sha512-e"],
    "tailwindcss": ["tailwindcss@4.3.3", "", {}, "sha512-f"],
  },
}`

describe('findPinConflicts', () => {
  it('flags a package that pins an exact version of a direct dependency we pin differently', () => {
    const pkg = { dependencies: { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.0' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([
      'bun.lock: @tailwindcss/vite@4.3.0 needs tailwindcss 4.3.0 exactly, but package.json pins 4.3.3. Update them together.',
    ])
  })

  it('ignores version ranges, which bun resolves to a separate copy safely', () => {
    const pkg = { dependencies: { zod: '4.6.5' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([])
  })

  it('ignores an exact pin on another major, which updating together could never fix', () => {
    const pkg = { dependencies: { zod: '4.4.3', satori: '0.26.0' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([])
  })

  it('checks exact peer and optional dependencies, written with or without "="', () => {
    const pkg = { dependencies: { 'widget-core': '2.1.1', 'widget-native': '2.0.9' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([
      'bun.lock: widget-react@2.1.0 needs widget-core 2.1.0 exactly, but package.json pins 2.1.1. Update them together.',
      'bun.lock: widget-react@2.1.0 needs widget-native 2.1.0 exactly, but package.json pins 2.0.9. Update them together.',
    ])
  })

  it('skips our dependencies that are not pinned to a plain version', () => {
    const pkg = { dependencies: { tailwindcss: 'npm:tailwindcss-fork@4.3.3' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([])
  })

  it('passes when the exact pins agree', () => {
    const pkg = { dependencies: { tailwindcss: '4.3.0' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([])
  })
})

const bunUpdates = (groups: Record<string, unknown>) => ({
  version: 2,
  updates: [{ 'package-ecosystem': 'bun', directory: '/', groups }],
})
const CATCH_ALL = {
  patterns: ['*'],
  'update-types': ['minor', 'patch'],
  'exclude-patterns': ['satori'],
}

describe('findZeroVersionsInBatchGroup', () => {
  it('flags a 0.x dependency whose minor updates would ride in the catch-all group', () => {
    const pkg = { dependencies: { 'drizzle-orm': '0.45.3', react: '19.3.0' } }
    expect(findZeroVersionsInBatchGroup(pkg, bunUpdates({ 'everything-else': CATCH_ALL }))).toEqual(
      [
        '.github/dependabot.yml: drizzle-orm 0.45.3 is a 0.x package, so its "minor" updates can break, but they land in the everything-else group with unrelated packages. Add it to that group\'s exclude-patterns.',
      ],
    )
  })

  it('passes a 0.x dependency excluded from the catch-all', () => {
    const pkg = { dependencies: { satori: '0.26.0' } }
    expect(findZeroVersionsInBatchGroup(pkg, bunUpdates({ 'everything-else': CATCH_ALL }))).toEqual(
      [],
    )
  })

  it('passes a 0.x dependency that a group of related packages claims', () => {
    const pkg = { devDependencies: { '@tanstack/devtools': '0.1.0' } }
    const config = bunUpdates({
      tanstack: { patterns: ['@tanstack/*'] },
      'everything-else': CATCH_ALL,
    })
    expect(findZeroVersionsInBatchGroup(pkg, config)).toEqual([])
  })

  it('ranks groups the way Dependabot does: a group without patterns outranks a wildcard', () => {
    const pkg = { devDependencies: { '@tanstack/devtools': '0.1.0' } }
    const config = bunUpdates({
      tanstack: { patterns: ['@tanstack/*'] },
      'dev-tools': { 'dependency-type': 'development', 'update-types': ['minor', 'patch'] },
    })
    expect(findZeroVersionsInBatchGroup(pkg, config)).toEqual([
      '.github/dependabot.yml: @tanstack/devtools 0.1.0 is a 0.x package, so its "minor" updates can break, but they land in the dev-tools group with unrelated packages. Add it to that group\'s exclude-patterns.',
    ])
  })

  it('leaves out groups that take only other update types', () => {
    const pkg = { dependencies: { 'react-thing': '0.3.0' } }
    const config = bunUpdates({
      'react-patches': { patterns: ['react*'], 'update-types': ['patch'] },
      'everything-else': CATCH_ALL,
    })
    expect(findZeroVersionsInBatchGroup(pkg, config)).toEqual([
      '.github/dependabot.yml: react-thing 0.3.0 is a 0.x package, so its "minor" updates can break, but they land in the everything-else group with unrelated packages. Add it to that group\'s exclude-patterns.',
    ])
  })

  it('leaves out groups for security updates only', () => {
    const pkg = { dependencies: { 'drizzle-orm': '0.45.3' } }
    const config = bunUpdates({ security: { patterns: ['*'], 'applies-to': 'security-updates' } })
    expect(findZeroVersionsInBatchGroup(pkg, config)).toEqual([])
  })

  it('fails when the config has no bun entry to check', () => {
    const config = { version: 2, updates: [{ 'package-ecosystem': 'npm', directory: '/' }] }
    expect(findZeroVersionsInBatchGroup({ dependencies: {} }, config)).toEqual([
      ".github/dependabot.yml: no bun entry, so check:deps can't see which group each package lands in.",
    ])
  })
})

const setupBun = (version?: string) => ({
  uses: 'oven-sh/setup-bun@v2',
  ...(version ? { with: { 'bun-version': version } } : {}),
})
const ciWith = (...steps: object[]) => ({
  jobs: { gate: { steps: [{ uses: 'actions/checkout@v5' }, ...steps] } },
})
const TYPES = { devDependencies: { '@types/bun': '1.4.3' } }

describe('findBunVersionDrift', () => {
  it('passes when the Dockerfile, every CI job and @types/bun name the same exact version', () => {
    const dockerfile = [
      'ARG PREVIOUS_IMAGE=bootstrap',
      'FROM oven/bun:1.4.3 AS bootstrap',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a Dockerfile build arg, not JS
      'FROM ${PREVIOUS_IMAGE} AS previous',
      'FROM oven/bun:1.4.3 AS base',
      'FROM base AS build',
    ].join('\n')
    const ci = { jobs: { a: { steps: [setupBun('1.4.3')] }, b: { steps: [setupBun('1.4.3')] } } }
    expect(findBunVersionDrift({ dockerfile, ciWorkflow: ci, pkg: TYPES })).toEqual([])
  })

  it('reads the version from image variants and digest pins', () => {
    const dockerfile = 'FROM oven/bun:1.4.3-alpine AS a\nFROM oven/bun:1.4.3@sha256:ec06c3b6 AS b'
    expect(
      findBunVersionDrift({ dockerfile, ciWorkflow: ciWith(setupBun('1.4.3')), pkg: TYPES }),
    ).toEqual([])
  })

  it.each([
    ['FROM oven/bun:1 AS base', 'oven/bun:1'],
    ['FROM oven/bun AS base', 'oven/bun'],
    ['FROM --platform=linux/amd64 oven/bun:1 AS base', 'oven/bun:1'],
    ['FROM docker.io/oven/bun:1.4', 'docker.io/oven/bun:1.4'],
    ['from oven/bun:latest as base', 'oven/bun:latest'],
  ])('flags a floating image: %s', (dockerfile, ref) => {
    expect(
      findBunVersionDrift({ dockerfile, ciWorkflow: ciWith(setupBun('1.4.3')), pkg: TYPES }),
    ).toEqual([
      `Dockerfile: ${ref} is not an exact Bun version, so each build can pick up a different Bun. Pin the version it resolves to today (docker buildx imagetools inspect ${ref}).`,
    ])
  })

  it('flags a CI job that does not pin an exact Bun', () => {
    const ci = ciWith(setupBun('1.4.3'), setupBun())
    expect(
      findBunVersionDrift({ dockerfile: 'FROM oven/bun:1.4.3', ciWorkflow: ci, pkg: TYPES }),
    ).toEqual([
      '.github/workflows/ci.yml: a setup-bun step has no exact bun-version, so CI can test on a different Bun. Pin it.',
    ])
  })

  it('flags versions that disagree', () => {
    const ci = { jobs: { a: { steps: [setupBun('1.4.3')] }, b: { steps: [setupBun('1.3.14')] } } }
    expect(
      findBunVersionDrift({ dockerfile: 'FROM oven/bun:1.4.3', ciWorkflow: ci, pkg: TYPES }),
    ).toEqual([
      'Bun versions disagree: Dockerfile 1.4.3, CI 1.4.3/1.3.14, @types/bun 1.4.3. Move all three together.',
    ])
  })
})
