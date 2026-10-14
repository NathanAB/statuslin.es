import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { insertPendingSubmission } from '@/submissions/record'
import { parseInputStepsArgs, runInputStepsCommand } from '../../scripts/input-steps'
import {
  addMod,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({ id: 'ada', name: 'Ada', email: 'ada@test.com' })
})
afterAll(async () => {
  await close()
})

describe('parseInputStepsArgs', () => {
  it.each([
    [['--prepare'], { mode: 'prepare', slug: null }],
    [['--prepare', 'meter'], { mode: 'prepare', slug: 'meter' }],
    [['--apply'], { mode: 'apply' }],
  ])('reads %j', (argv, expected) => {
    expect(parseInputStepsArgs(argv)).toEqual(expected)
  })

  it.each([[[]], [['--apply', 'meter']], [['--prepare', 'a', 'b']], [['--nope']]])(
    'refuses %j with the usage',
    (argv) => {
      expect(() => parseInputStepsArgs(argv)).toThrow(/Usage/)
    },
  )
})

describe('runInputStepsCommand', () => {
  it('prints the requests, then stores the steps the agent answers with', async () => {
    const modId = await addMod(db, 'meter', 'draft')
    const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1 })
    await setCurrentVersion(db, modId, versionId)
    await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'ada' })
    const out: string[] = []
    const io = {
      readStdin: async () => '',
      writeStdout: (value: string) => out.push(value),
      writeStderr: () => {},
      readModReadme: async () => null,
    }

    await runInputStepsCommand({ mode: 'prepare', slug: null }, db, io)
    const [request] = JSON.parse(out[0] ?? '[]')
    expect(request).toMatchObject({ slug: 'meter', versionId, commitSha: sha('a') })

    const steps = [{ type: 'text', text: '/meter' }]
    await runInputStepsCommand({ mode: 'apply' }, db, {
      ...io,
      readStdin: async () => JSON.stringify([{ ...request, prompt: undefined, inputSteps: steps }]),
    })
    const [row] = await db
      .select({ inputSteps: schema.modVersions.inputSteps })
      .from(schema.modVersions)
      .where(eq(schema.modVersions.id, versionId))
    expect(row?.inputSteps).toEqual(steps)
  })
})
