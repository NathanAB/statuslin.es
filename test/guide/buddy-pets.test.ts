import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { sharedCommands } from '@/guide/buddy-pets'
import { buddyPets } from '@/guide/buddy-pets.server'
import {
  addMod,
  addVersion,
  openTestDb,
  seedMod,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

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

/** A published mod whose current version adds `commands` as slash commands. */
async function seedPet(slug: string, commitChar: string, commands: string[]) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, {
    commitSha: sha(commitChar),
    versionNumber: 1,
    footprint: { events: commands.map((c) => `command.run{command=${c}}`), calls: [] },
  })
  await setCurrentVersion(db, modId, versionId)
}

describe('buddyPets', () => {
  it('returns the published pets as gallery cards in the order given, leaving out the rest', async () => {
    await seedMod(db, 'cat', 'published', 'a')
    await seedMod(db, 'egg', 'draft', 'b')
    await seedMod(db, 'dog', 'published', 'c')
    await seedMod(db, 'ghost', 'removed', 'd')

    const { cards } = await buddyPets(db, ['dog', 'egg', 'missing', 'ghost', 'cat'])

    expect(cards.map((card) => card.slug)).toEqual(['dog', 'cat'])
    expect(cards[0]).toMatchObject({
      title: 'dog',
      preview: [{ text: 'meter' }],
      desktopShot: null,
    })
  })

  it("names the commands two or more published pets add, from their current versions' footprints", async () => {
    await seedPet('pets', 'a', ['pet'])
    await seedPet('cat', 'b', ['cat'])
    await seedPet('pixipet', 'c', ['pet'])
    await seedMod(db, 'draft-pet', 'draft', 'd')

    const { clashes } = await buddyPets(db, ['pets', 'cat', 'pixipet', 'draft-pet'])

    expect(clashes).toEqual([{ command: 'pet', titles: ['pets', 'pixipet'] }])
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
