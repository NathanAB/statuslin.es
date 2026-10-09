import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { runDelist } from '../../scripts/delist-mod'
import { addMod, modState, openTestDb, type TestDb } from './seed-mods'

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

async function delist(args: string[]) {
  const lines: string[] = []
  const exitCode = await runDelist(args, { db, log: (line) => lines.push(line) })
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
  it('puts a removed mod back', async () => {
    await addMod(db, 'meter', 'removed')

    const { exitCode } = await delist(['meter', '--restore'])

    expect(exitCode).toBe(0)
    expect(await statusOf('meter')).toBe('published')
  })

  it('refuses a mod that is not removed', async () => {
    await addMod(db, 'meter', 'draft')

    await expect(delist(['meter', '--restore'])).rejects.toThrow(/is draft, not removed/)
  })
})

it('prints usage without a slug', async () => {
  const { exitCode, output } = await delist([])

  expect(exitCode).toBe(1)
  expect(output).toMatch(/Usage/)
})
