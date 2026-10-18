import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { sharedCommands } from '@/guide/buddy-pets'
import { publishedMods } from '@/guide/buddy-pets.server'
import { openTestDb, seedMod, sha, type TestDb } from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
afterAll(async () => {
  await close()
})
beforeEach(async () => {
  await db.delete(schema.mods)
})

describe('publishedMods', () => {
  it('returns the published pets in the order given, leaving out drafts, removed and unknown slugs', async () => {
    await seedMod(db, 'cat', 'published', 'a')
    await seedMod(db, 'egg', 'draft', 'b')
    await seedMod(db, 'dog', 'published', 'c')
    await seedMod(db, 'ghost', 'removed', 'd')

    const pets = await publishedMods(db, ['dog', 'egg', 'missing', 'ghost', 'cat'])

    expect(pets.map((pet) => pet.slug)).toEqual(['dog', 'cat'])
  })

  it('carries what a pet section shows: previews, footprint and the reviewed commit', async () => {
    await seedMod(db, 'cat', 'published', 'a')

    const [cat] = await publishedMods(db, ['cat'])

    expect(cat).toMatchObject({
      slug: 'cat',
      preview: [{ text: 'meter' }],
      desktop: { kind: 'nothing' },
      footprint: { events: [], calls: [] },
      commitSha: sha('a'),
    })
  })
})

describe('sharedCommands', () => {
  const pet = (slug: string, events: string[]) => ({
    title: slug,
    footprint: { events, calls: ['$.command.register'] },
  })

  it('names each slash command two or more pets add, with the pets that add it', () => {
    const pets = [
      pet('Pets', ['command.run{command=pet}']),
      pet('Cat', ['command.run{command=cat|mods}']),
      pet('Pixipet', ['command.run{command=pet}', 'command.run{command=mods}']),
      pet('Code Pet', ['command.run{command=pet}', 'session.start']),
    ]

    expect(sharedCommands(pets)).toEqual([
      { command: 'pet', titles: ['Pets', 'Pixipet', 'Code Pet'] },
      { command: 'mods', titles: ['Cat', 'Pixipet'] },
    ])
  })

  it('is empty when every command belongs to one pet', () => {
    expect(
      sharedCommands([
        pet('Cat', ['command.run{command=cat}']),
        pet('Dog', ['command.run{command=dog}']),
        pet('Quiet', []),
      ]),
    ).toEqual([])
  })
})
