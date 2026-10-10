import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { GitHub } from '@/mods/github'
import { runDelist } from '../../scripts/delist-mod'
import {
  addMod,
  addVersion,
  fakeGitHub,
  modState,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from './seed-mods'

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

async function delist(args: string[], github: GitHub = fakeGitHub()) {
  const lines: string[] = []
  const exitCode = await runDelist(args, { db, github, log: (line) => lines.push(line) })
  return { exitCode, output: lines.join('\n') }
}

async function statusOf(slug: string) {
  return (await modState(db, slug))?.status
}

describe('delist', () => {
  it.each([
    ['no confirmation', []],
    ['a confirmation that does not match', ['--confirm=metre']],
  ])('changes nothing with %s and explains the uninstall', async (_name, flags) => {
    await addMod(db, 'meter', 'published')

    const { exitCode, output } = await delist(['meter', ...flags])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/uninstall/)
    expect(output).toMatch(/--confirm=meter/)
    expect(await statusOf('meter')).toBe('published')
  })

  it('sets the mod to removed once the slug is typed back', async () => {
    await addMod(db, 'meter', 'published')

    const { exitCode } = await delist(['meter', '--confirm=meter'])

    expect(exitCode).toBe(0)
    expect(await statusOf('meter')).toBe('removed')
  })

  it('refuses a mod that is not published', async () => {
    await addMod(db, 'meter', 'draft')

    await expect(delist(['meter', '--confirm=meter'])).rejects.toThrow(/is draft, not published/)
    expect(await statusOf('meter')).toBe('draft')
  })
})

describe('delist --restore', () => {
  async function removedMod(rendered = true) {
    const modId = await addMod(db, 'meter', 'removed')
    const versionId = await addVersion(db, modId, {
      commitSha: sha('a'),
      versionNumber: 1,
      rendered,
    })
    await setCurrentVersion(db, modId, versionId)
  }

  it('puts a removed mod back once the slug is typed back', async () => {
    await removedMod()

    const { exitCode } = await delist(['meter', '--restore', '--confirm=meter'])

    expect(exitCode).toBe(0)
    expect(await statusOf('meter')).toBe('published')
  })

  it.each([
    ['no confirmation', []],
    ['a confirmation that does not match', ['--confirm=metre']],
  ])('changes nothing with %s', async (_name, flags) => {
    await removedMod()

    const { exitCode, output } = await delist(['meter', '--restore', ...flags])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/REFUSE confirmation: .*--confirm=meter/)
    expect(await statusOf('meter')).toBe('removed')
  })

  it('refuses when the current version has not rendered', async () => {
    await removedMod(false)

    const { exitCode, output } = await delist(['meter', '--restore', '--confirm=meter'])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/REFUSE not-rendered/)
    expect(await statusOf('meter')).toBe('removed')
  })

  it('refuses when the current commit is not on the default branch', async () => {
    await removedMod()

    const { exitCode, output } = await delist(
      ['meter', '--restore', '--confirm=meter'],
      fakeGitHub({ onDefaultBranch: false }),
    )

    expect(exitCode).toBe(1)
    expect(output).toMatch(/REFUSE not-on-default-branch/)
    expect(await statusOf('meter')).toBe('removed')
  })

  it('refuses a mod with no current version', async () => {
    await addMod(db, 'meter', 'removed')

    await expect(delist(['meter', '--restore', '--confirm=meter'])).rejects.toThrow(
      /no current version/,
    )
    expect(await statusOf('meter')).toBe('removed')
  })

  it('refuses a mod that is not removed', async () => {
    await addMod(db, 'meter', 'draft')

    await expect(delist(['meter', '--restore', '--confirm=meter'])).rejects.toThrow(
      /is draft, not removed/,
    )
  })
})

it('escapes and caps each printed line', async () => {
  const slug = 'meter\u001b[2K\n'
  const modId = await addMod(db, slug, 'removed')
  const path = `plugins/${'p'.repeat(1000)}`
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1, path })
  await setCurrentVersion(db, modId, versionId)

  const lines: string[] = []
  await runDelist([slug, '--restore', `--confirm=${slug}`], {
    db,
    github: fakeGitHub(),
    log: (line) => lines.push(line),
  })

  expect(lines.join('')).not.toMatch(/\p{Cc}/u)
  expect(lines.some((line) => line.includes('meter\\u001b[2K\\u000a'))).toBe(true)
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(500)
})

it('prints usage without a slug', async () => {
  const { exitCode, output } = await delist([])

  expect(exitCode).toBe(1)
  expect(output).toMatch(/Usage/)
})
