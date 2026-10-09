import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { GitHub } from '@/mods/github'
import { runPublish } from '../../scripts/publish-mod'
import {
  addMod,
  addVersion,
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

interface FakeGitHub extends GitHub {
  calls: string[]
}

function fakeGitHub(opts: { onDefaultBranch?: boolean; filesChanged?: string[] } = {}): FakeGitHub {
  const calls: string[] = []
  return {
    calls,
    async commitIsOnDefaultBranch(_repo, commit) {
      calls.push(`on-default:${commit}`)
      return opts.onDefaultBranch ?? true
    },
    async filesChanged(_repo, base, head) {
      calls.push(`files:${base}...${head}`)
      return opts.filesChanged ?? []
    },
    async commitIsFetchable() {
      throw new Error('publish never asks whether a commit is fetchable')
    },
  }
}

async function publish(args: string[], github: GitHub = fakeGitHub()) {
  const lines: string[] = []
  const exitCode = await runPublish(args, { db, github, log: (line) => lines.push(line) })
  return { exitCode, output: lines.join('\n') }
}

async function draftMod(slug = 'meter', rendered = true) {
  const modId = await addMod(db, slug, 'draft')
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1, rendered })
  return { modId, versionId }
}

async function publishedMod(current: {
  pluginVersion?: string | null
  footprint?: schema.ModFootprint
}) {
  const modId = await addMod(db, 'meter', 'published')
  const currentId = await addVersion(db, modId, {
    commitSha: sha('a'),
    versionNumber: 1,
    ...current,
  })
  await setCurrentVersion(db, modId, currentId)
  return { modId, currentId }
}

describe('publish confirmation', () => {
  it('is a dry run without --apply', async () => {
    await draftMod()

    const { exitCode, output } = await publish(['meter', sha('a')])

    expect(exitCode).toBe(0)
    expect(output).toMatch(/dry run/i)
    expect(await modState(db, 'meter')).toEqual({ status: 'draft', currentVersionId: null })
  })

  it.each([
    ['no typed slug', ['--apply']],
    ['a typed slug that does not match', ['--apply', '--confirm=metre']],
  ])('refuses --apply with %s', async (_name, flags) => {
    await draftMod()

    const { exitCode, output } = await publish(['meter', sha('a'), ...flags])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/--confirm=meter/)
    expect(await modState(db, 'meter')).toEqual({ status: 'draft', currentVersionId: null })
  })

  it('publishes the version with --apply and the typed slug', async () => {
    const { versionId } = await draftMod()

    const { exitCode } = await publish(['meter', sha('a'), '--apply', '--confirm=meter'])

    expect(exitCode).toBe(0)
    expect(await modState(db, 'meter')).toEqual({
      status: 'published',
      currentVersionId: versionId,
    })
  })

  it('re-pins a published mod to the new version', async () => {
    const { modId } = await publishedMod({})
    const nextId = await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })

    const { exitCode } = await publish(['meter', sha('b'), '--apply', '--confirm=meter'])

    expect(exitCode).toBe(0)
    expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: nextId })
  })
})

describe('publish refusals', () => {
  it.each([
    ['uppercase hex', 'A'.repeat(40)],
    ['39 characters', 'a'.repeat(39)],
    ['41 characters', 'a'.repeat(41)],
    ['a non-hex character', `${'a'.repeat(39)}g`],
    ['a branch name', 'main'],
  ])('refuses a SHA with %s before any lookup', async (_name, badSha) => {
    await draftMod()
    const github = fakeGitHub()

    const { exitCode, output } = await publish(
      ['meter', badSha, '--apply', '--confirm=meter'],
      github,
    )

    expect(exitCode).toBe(1)
    expect(output).toMatch(/40 lowercase hex/)
    expect(github.calls).toEqual([])
    expect(await modState(db, 'meter')).toEqual({ status: 'draft', currentVersionId: null })
  })

  it('refuses a commit that is not on the default branch', async () => {
    await draftMod()

    const { exitCode, output } = await publish(
      ['meter', sha('a'), '--apply', '--confirm=meter'],
      fakeGitHub({ onDefaultBranch: false }),
    )

    expect(exitCode).toBe(1)
    expect(output).toMatch(/not on the repository's default branch/)
    expect(await modState(db, 'meter')).toEqual({ status: 'draft', currentVersionId: null })
  })

  it('refuses a version that has not rendered', async () => {
    await draftMod('meter', false)

    const { exitCode, output } = await publish(['meter', sha('a'), '--apply', '--confirm=meter'])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/has not rendered/)
    expect(await modState(db, 'meter')).toEqual({ status: 'draft', currentVersionId: null })
  })

  it('refuses a delisted mod, which only delist --restore brings back', async () => {
    const modId = await addMod(db, 'meter', 'removed')
    await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1 })

    const { exitCode, output } = await publish(['meter', sha('a'), '--apply', '--confirm=meter'])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/--restore/)
    expect((await modState(db, 'meter'))?.status).toBe('removed')
  })

  it('names the import step when no version exists at that commit', async () => {
    await draftMod()

    await expect(publish(['meter', sha('c')])).rejects.toThrow(/no version of "meter" at c{40}/)
  })
})

describe('publish review output', () => {
  it('prints the files changed and the footprint before and after a re-pin', async () => {
    const { modId } = await publishedMod({
      footprint: { events: ['Stop'], calls: ['$.sessionId'] },
    })
    await addVersion(db, modId, {
      commitSha: sha('b'),
      versionNumber: 2,
      footprint: { events: ['Stop'], calls: ['$.model'] },
    })
    const github = fakeGitHub({ filesChanged: ['hooks/meter.ts', '.claude-plugin/plugin.json'] })

    const { output } = await publish(['meter', sha('b')], github)

    expect(github.calls).toContain(`files:${sha('a')}...${sha('b')}`)
    expect(output).toContain('hooks/meter.ts')
    expect(output).toContain('.claude-plugin/plugin.json')
    expect(output).toMatch(/footprint before: events \[Stop\] calls \[\$\.sessionId\]/)
    expect(output).toMatch(/footprint after: events \[Stop\] calls \[\$\.model\]/)
  })

  it.each([
    ['an event', { events: ['Stop', 'SessionStart'], calls: [] }, /adds events \[SessionStart\]/],
    ['a $ call', { events: ['Stop'], calls: ['$.cost'] }, /adds \$ calls \[\$\.cost\]/],
  ])('warns when the footprint adds %s, without blocking --apply', async (_name, footprint, warning) => {
    const { modId } = await publishedMod({ footprint: { events: ['Stop'], calls: [] } })
    const nextId = await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2, footprint })

    const { exitCode, output } = await publish(['meter', sha('b'), '--apply', '--confirm=meter'])

    expect(output).toMatch(/WARN/)
    expect(output).toMatch(warning)
    expect(exitCode).toBe(0)
    expect((await modState(db, 'meter'))?.currentVersionId).toBe(nextId)
  })

  it('does not warn when the footprint only shrinks', async () => {
    const { modId } = await publishedMod({ footprint: { events: ['Stop'], calls: ['$.cost'] } })
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })

    const { output } = await publish(['meter', sha('b')])

    expect(output).not.toMatch(/WARN/)
  })

  it('warns when plugin_version is unchanged from the current version', async () => {
    const { modId } = await publishedMod({ pluginVersion: '1.2.0' })
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2, pluginVersion: '1.2.0' })

    const { output } = await publish(['meter', sha('b')])

    expect(output).toMatch(/WARN.*plugin\.json version 1\.2\.0 is unchanged/)
  })

  it.each([
    ['changed', '1.2.0', '1.3.0'],
    ['absent, so the commit SHA versions it', null, null],
  ])('does not warn about plugin_version when it is %s', async (_name, before, after) => {
    const { modId } = await publishedMod({ pluginVersion: before })
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2, pluginVersion: after })

    const { output } = await publish(['meter', sha('b')])

    expect(output).not.toMatch(/WARN/)
  })
})
