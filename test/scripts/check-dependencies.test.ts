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
    "react-dom": ["react-dom@19.3.0", "", { "peerDependencies": { "react": "19.3.0" } }, "sha512-c"],
    "tailwindcss": ["tailwindcss@4.3.3", "", {}, "sha512-d"],
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
    const pkg = { dependencies: { zod: '4.4.3' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([])
  })

  it('checks exact peer dependencies too', () => {
    const pkg = { dependencies: { react: '19.2.6', 'react-dom': '19.3.0' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([
      'bun.lock: react-dom@19.3.0 needs react 19.3.0 exactly, but package.json pins 19.2.6. Update them together.',
    ])
  })

  it('passes when the exact pins agree', () => {
    const pkg = { dependencies: { tailwindcss: '4.3.0' }, devDependencies: { react: '19.3.0' } }
    expect(findPinConflicts(pkg, LOCK)).toEqual([])
  })
})

const DEPENDABOT = `
version: 2
updates:
  - package-ecosystem: bun
    directory: /
    groups:
      tanstack:
        patterns: ['@tanstack/*']
      everything-else:
        patterns: ['*']
        update-types: [minor, patch]
        exclude-patterns: [satori]
`

describe('findZeroVersionsInBatchGroup', () => {
  it('flags a 0.x dependency that would ride in the minor/patch batch', () => {
    const pkg = { dependencies: { 'drizzle-orm': '0.45.3', react: '19.3.0' } }
    expect(findZeroVersionsInBatchGroup(pkg, DEPENDABOT)).toEqual([
      '.github/dependabot.yml: drizzle-orm 0.45.3 is a 0.x package, so its "minor" updates can break, but it lands in the everything-else group. Add it to that group\'s exclude-patterns.',
    ])
  })

  it('passes a 0.x dependency that is excluded from the batch', () => {
    const pkg = { dependencies: { satori: '0.26.0' } }
    expect(findZeroVersionsInBatchGroup(pkg, DEPENDABOT)).toEqual([])
  })

  it('passes a 0.x dependency that a more specific group claims', () => {
    const pkg = { devDependencies: { '@tanstack/devtools': '0.1.0' } }
    expect(findZeroVersionsInBatchGroup(pkg, DEPENDABOT)).toEqual([])
  })
})

const CI = `
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.3
`

describe('findBunVersionDrift', () => {
  it('passes when the Dockerfile, CI and @types/bun name the same exact version', () => {
    const dockerfile =
      'FROM oven/bun:1.4.3 AS a\nFROM ${PREVIOUS_IMAGE} AS b\nFROM oven/bun:1.4.3 AS base\nFROM base AS build'
    const pkg = { devDependencies: { '@types/bun': '1.4.3' } }
    expect(findBunVersionDrift({ dockerfile, ciWorkflow: CI, pkg })).toEqual([])
  })

  it('flags a floating Docker tag', () => {
    const pkg = { devDependencies: { '@types/bun': '1.4.3' } }
    expect(
      findBunVersionDrift({ dockerfile: 'FROM oven/bun:1 AS base', ciWorkflow: CI, pkg }),
    ).toEqual([
      'Dockerfile: oven/bun:1 is not an exact version, so each build can pick up a different Bun. Pin it, e.g. oven/bun:1.4.3.',
    ])
  })

  it('flags versions that disagree', () => {
    const pkg = { devDependencies: { '@types/bun': '1.3.14' } }
    expect(findBunVersionDrift({ dockerfile: 'FROM oven/bun:1.4.3', ciWorkflow: CI, pkg })).toEqual(
      [
        'Bun versions disagree: Dockerfile 1.4.3, CI 1.4.3, @types/bun 1.3.14. Move all three together.',
      ],
    )
  })
})
