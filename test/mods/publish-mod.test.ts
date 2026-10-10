import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { GitHub } from '@/mods/github'
import { runPublish } from '../../scripts/publish-mod'
import {
  addMod,
  addVersion,
  fakeGitHub,
  modState,
  openTestDb,
  REPO_URL,
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

async function publish(args: string[], github: GitHub = fakeGitHub()) {
  const lines: string[] = []
  const exitCode = await runPublish(args, { db, github, log: (line) => lines.push(line) })
  return { exitCode, lines, output: lines.join('\n') }
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

describe('first publish of an imported draft', () => {
  async function importedDraft() {
    const modId = await addMod(db, 'meter', 'draft')
    const versionId = await addVersion(db, modId, {
      commitSha: sha('a'),
      versionNumber: 1,
      pluginVersion: '0.1.0',
      footprint: { events: ['Stop'], calls: ['$.model'] },
    })
    await setCurrentVersion(db, modId, versionId)
    return { modId, versionId }
  }

  it('reports a first publish with no comparison against the imported pointer', async () => {
    await importedDraft()
    const github = fakeGitHub()

    const { exitCode, output } = await publish(['meter', sha('a')], github)

    expect(exitCode).toBe(0)
    expect(output).not.toMatch(/WARN/)
    expect(output).toContain('source before: none (first publish)')
    expect(output).toContain('footprint before: none (first publish)')
    expect(output).toContain('files changed: none to compare (first publish)')
    expect(github.calls.filter((c) => c.startsWith('files:'))).toEqual([])
  })

  it('publishes it with --apply', async () => {
    const { versionId } = await importedDraft()

    const { exitCode } = await publish(['meter', sha('a'), '--apply', '--confirm=meter'])

    expect(exitCode).toBe(0)
    expect(await modState(db, 'meter')).toEqual({
      status: 'published',
      currentVersionId: versionId,
    })
  })

  it('treats a draft pointing at an older version as a first publish of the target', async () => {
    const { modId } = await importedDraft()
    const nextId = await addVersion(db, modId, {
      commitSha: sha('b'),
      versionNumber: 2,
      pluginVersion: '0.1.0',
      repoUrl: 'https://github.com/mallory/meter',
      footprint: { events: ['Stop', 'SessionStart'], calls: ['$.model'] },
    })

    const { exitCode, output } = await publish(['meter', sha('b'), '--apply', '--confirm=meter'])

    expect(output).not.toMatch(/WARN/)
    expect(output).toContain('source before: none (first publish)')
    expect(exitCode).toBe(0)
    expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: nextId })
  })

  it('refuses when the draft is published between its first-publish report and the write', async () => {
    const { modId, versionId } = await importedDraft()
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
    const publishMeanwhile = async () => {
      await db.update(schema.mods).set({ status: 'published' }).where(eq(schema.mods.id, modId))
    }

    const { exitCode, output } = await publish(
      ['meter', sha('b'), '--apply', '--confirm=meter'],
      fakeGitHub({ meanwhile: publishMeanwhile }),
    )

    expect(exitCode).toBe(1)
    expect(output).toMatch(/REFUSE current-version-changed/)
    expect(await modState(db, 'meter')).toEqual({
      status: 'published',
      currentVersionId: versionId,
    })
  })

  it('refuses to re-publish the version a published mod already points at', async () => {
    const { currentId } = await publishedMod({ pluginVersion: '0.1.0' })
    const github = fakeGitHub()

    const { exitCode, output } = await publish(
      ['meter', sha('a'), '--apply', '--confirm=meter'],
      github,
    )

    expect(exitCode).toBe(1)
    expect(output).toMatch(/REFUSE already-current: "meter" is already published at a{40}/)
    expect(output).not.toMatch(/WARN/)
    expect(github.calls).toEqual([])
    expect(await modState(db, 'meter')).toEqual({
      status: 'published',
      currentVersionId: currentId,
    })
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

describe('publish report escaping', () => {
  const FORGED = 'evil.ts\n\x1b[1A\x1b[2KWARN forged: nothing to see'

  it.each([
    ['a filename', { filesChanged: [FORGED] }, {}],
    ['a footprint event', {}, { events: [FORGED], calls: [] }],
  ])('prints control characters in %s escaped, on one line', async (_name, github, footprint) => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, {
      commitSha: sha('b'),
      versionNumber: 2,
      footprint: { events: [], calls: [], ...footprint },
    })

    const { lines } = await publish(['meter', sha('b')], fakeGitHub(github))

    expect(lines.join('')).not.toContain('\n')
    expect(lines.join('')).not.toContain('\x1b')
    expect(lines.some((line) => line.startsWith('WARN forged'))).toBe(false)
    expect(
      lines.some((line) => line.includes('evil.ts\\u000a\\u001b[1A\\u001b[2KWARN forged')),
    ).toBe(true)
  })

  it('prints the description the marketplace and llms.txt will show, escaped', async () => {
    const { modId } = await draftMod()
    await db
      .update(schema.mods)
      .set({ description: `](https://evil.example) ${FORGED}` })
      .where(eq(schema.mods.id, modId))

    const { lines } = await publish(['meter', sha('a')])

    expect(lines).toContain(
      'description: ](https://evil.example) evil.ts\\u000a\\u001b[1A\\u001b[2KWARN forged: nothing to see',
    )
  })

  it('escapes a literal backslash so a filename cannot pose as an escaped one', async () => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })

    const { output } = await publish(
      ['meter', sha('b')],
      fakeGitHub({ filesChanged: ['evil\\u000a.ts'] }),
    )

    expect(output).toContain('evil\\u005cu000a.ts')
  })
})

describe('publish report length', () => {
  it('caps each printed line at 500 characters', async () => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })

    const { lines } = await publish(
      ['meter', sha('b')],
      fakeGitHub({ filesChanged: [`${'x'.repeat(1000)}.ts`] }),
    )

    expect(lines.some((line) => /^ {2}x+… \(\d+ more characters\)$/.test(line))).toBe(true)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(500)
  })
})

describe('publish source', () => {
  it('refuses when two versions of the mod share the SHA', async () => {
    const modId = await addMod(db, 'meter', 'draft')
    await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1 })
    await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 2, path: 'plugins/meter' })

    await expect(publish(['meter', sha('a'), '--apply', '--confirm=meter'])).rejects.toThrow(
      /2 versions of "meter" at a{40}/,
    )
    expect(await modState(db, 'meter')).toEqual({ status: 'draft', currentVersionId: null })
  })

  it('prints the repository and path before and after', async () => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })

    const { output } = await publish(['meter', sha('b')])

    expect(output).toContain(`source before: ${REPO_URL} path ""`)
    expect(output).toContain(`source after: ${REPO_URL} path ""`)
    expect(output).not.toMatch(/WARN/)
  })

  it('prints no source before on a first publish', async () => {
    await draftMod()

    const { output } = await publish(['meter', sha('a')])

    expect(output).toContain('source before: none (first publish)')
    expect(output).toContain(`source after: ${REPO_URL} path ""`)
  })

  it.each([
    ['repository', { repoUrl: 'https://github.com/mallory/meter' }, /mallory\/meter path ""/],
    ['path', { path: 'plugins/other' }, /octocat\/meter path "plugins\/other"/],
  ])('warns when the %s changes', async (_name, seed, after) => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2, ...seed })

    const { exitCode, output } = await publish(['meter', sha('b')])

    expect(exitCode).toBe(0)
    expect(output).toMatch(/WARN source-changed/)
    expect(output).toMatch(after)
  })

  it('skips the files compare when the repository changes', async () => {
    const { modId } = await publishedMod({})
    const repoUrl = 'https://github.com/mallory/meter'
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2, repoUrl })
    const github = fakeGitHub()

    const { output } = await publish(['meter', sha('b')], github)

    expect(github.calls.filter((c) => c.startsWith('files:'))).toEqual([])
    expect(output).toMatch(/files changed: none to compare \(the repository changed\)/)
  })

  it("warns at GitHub's 300-file compare cap and names the compare URL", async () => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
    const files = Array.from({ length: 300 }, (_, i) => `file-${i}.ts`)

    const { output } = await publish(['meter', sha('b')], fakeGitHub({ filesChanged: files }))

    expect(output).toMatch(/WARN files-truncated/)
    expect(output).toContain(`${REPO_URL}/compare/${sha('a')}...${sha('b')}`)
  })

  it('does not warn about truncation under 300 files', async () => {
    const { modId } = await publishedMod({})
    await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
    const files = Array.from({ length: 299 }, (_, i) => `file-${i}.ts`)

    const { output } = await publish(['meter', sha('b')], fakeGitHub({ filesChanged: files }))

    expect(output).not.toMatch(/WARN/)
  })
})

it('leaves a mod removed when a delist lands between the checks and the write', async () => {
  const { modId } = await draftMod()
  const delistMeanwhile = async () => {
    await db.update(schema.mods).set({ status: 'removed' }).where(eq(schema.mods.id, modId))
  }

  const { exitCode, output } = await publish(
    ['meter', sha('a'), '--apply', '--confirm=meter'],
    fakeGitHub({ meanwhile: delistMeanwhile }),
  )

  expect(exitCode).toBe(1)
  expect(output).toMatch(/delisted/)
  expect(await modState(db, 'meter')).toEqual({ status: 'removed', currentVersionId: null })
})

it('refuses when another publish re-pins the mod between the report and the write', async () => {
  const { modId } = await publishedMod({})
  await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
  const otherId = await addVersion(db, modId, { commitSha: sha('c'), versionNumber: 3 })
  const repinMeanwhile = async () => {
    await setCurrentVersion(db, modId, otherId)
  }

  const { exitCode, output } = await publish(
    ['meter', sha('b'), '--apply', '--confirm=meter'],
    fakeGitHub({ meanwhile: repinMeanwhile }),
  )

  expect(exitCode).toBe(1)
  expect(output).toMatch(/REFUSE current-version-changed/)
  expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: otherId })
})

it('refuses a mod whose current version belongs to another mod instead of calling it a first publish', async () => {
  const ownerId = await addMod(db, 'owner', 'published')
  const borrowedId = await addVersion(db, ownerId, { commitSha: sha('a'), versionNumber: 1 })
  const modId = await addMod(db, 'meter', 'published')
  await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 1 })
  await setCurrentVersion(db, modId, borrowedId)

  await expect(publish(['meter', sha('b')])).rejects.toThrow(
    `current_version_id ${borrowedId} is not a version of this mod`,
  )
  expect(await modState(db, 'meter')).toEqual({ status: 'published', currentVersionId: borrowedId })
})
