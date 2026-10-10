import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { GitHub } from '@/mods/github'
import { runCheck } from '../../scripts/check-mods'
import { addMod, addVersion, openTestDb, setCurrentVersion, sha, type TestDb } from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

function githubWithout(missing: string[]): GitHub {
  return {
    commitIsOnDefaultBranch: async () => {
      throw new Error('check only asks whether commits are fetchable')
    },
    filesChanged: async () => {
      throw new Error('check only asks whether commits are fetchable')
    },
    commitIsFetchable: async (_repo, commit) => !missing.includes(commit),
  }
}

async function seed(slug: string, status: schema.ModStatus, commitSha: string) {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, { commitSha, versionNumber: 1 })
  await setCurrentVersion(db, modId, versionId)
}

async function check(github: GitHub) {
  const lines: string[] = []
  const exitCode = await runCheck({ db, github, log: (line) => lines.push(line) })
  return { exitCode, output: lines.join('\n') }
}

it('lists every published mod whose commit cannot be fetched and exits non-zero', async () => {
  await seed('gone-a', 'published', sha('a'))
  await seed('fine', 'published', sha('b'))
  await seed('gone-c', 'published', sha('c'))
  await seed('draft-gone', 'draft', sha('d'))
  await seed('removed-gone', 'removed', sha('e'))

  const { exitCode, output } = await check(githubWithout([sha('a'), sha('c'), sha('d'), sha('e')]))

  expect(exitCode).toBe(1)
  expect(output).toContain(`gone-a https://github.com/octocat/meter ${sha('a')}`)
  expect(output).toContain(`gone-c https://github.com/octocat/meter ${sha('c')}`)
  expect(output).not.toMatch(/\bfine\b|draft-gone|removed-gone/)
})

it('exits zero when every published commit can be fetched', async () => {
  await seed('fine', 'published', sha('b'))

  const { exitCode, output } = await check(githubWithout([]))

  expect(exitCode).toBe(0)
  expect(output).toMatch(/all 1 published mod commits can be fetched/)
})

it('ignores a current version that belongs to another mod', async () => {
  const ownerId = await addMod(db, 'owner', 'draft')
  const borrowedId = await addVersion(db, ownerId, { commitSha: sha('a'), versionNumber: 1 })
  const borrowerId = await addMod(db, 'borrower', 'published')
  await setCurrentVersion(db, borrowerId, borrowedId)

  const { exitCode, output } = await check(githubWithout([sha('a')]))

  expect(output).not.toMatch(/borrower/)
  expect(exitCode).toBe(0)
})

it('escapes and caps each printed line', async () => {
  const modId = await addMod(db, 'forged\u001b[2K\n', 'published')
  const repoUrl = `https://github.com/octocat/${'x'.repeat(1000)}`
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1, repoUrl })
  await setCurrentVersion(db, modId, versionId)

  const lines: string[] = []
  await runCheck({ db, github: githubWithout([sha('a')]), log: (line) => lines.push(line) })

  expect(lines.join('')).not.toMatch(/\p{Cc}/u)
  expect(lines.some((line) => line.includes('forged\\u001b[2K\\u000a'))).toBe(true)
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(500)
})
