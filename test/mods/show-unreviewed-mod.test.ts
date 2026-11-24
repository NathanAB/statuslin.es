import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { CurationEntry } from '@/mods/curation'
import { runShowUnreviewed } from '@/mods/show-unreviewed'
import {
  addDesktopTheme,
  addMod,
  addShownDraft,
  addVersion,
  openTestDb,
  sha,
  type TestDb,
} from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({ id: 'ada', name: 'Ada', email: 'ada@test.com' })
})
beforeEach(async () => {
  await db.delete(schema.unreviewedMods)
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

const REPO = 'https://github.com/Ada/looks'

const ENTRY: CurationEntry = {
  repoUrl: REPO,
  path: 'plugins/looks',
  commitSha: sha('f'),
  pluginName: 'looks',
  title: 'Looks',
  inputSteps: [],
}

/** A curated Desktop theme pack imported and recorded at the curation file's commit, not shown. */
async function pack(slug = 'looks-pack', over: { pluginName?: string; path?: string } = {}) {
  const seeded = await addShownDraft(db, {
    slug,
    pluginName: over.pluginName ?? 'looks',
    repoUrl: REPO,
    path: over.path ?? 'plugins/looks',
    shown: false,
  })
  await addDesktopTheme(db, seeded.versionId, { key: 'night-reef', name: 'Night Reef' })
  await addDesktopTheme(db, seeded.versionId, { key: 'lagoon', name: 'Lagoon' })
  return seeded
}

async function run(argv: string[], curation: CurationEntry[] = [ENTRY]) {
  const lines: string[] = []
  const exitCode = await runShowUnreviewed(argv, { db, curation, log: (l) => lines.push(l) })
  return { exitCode, lines }
}

async function shownAt(slug: string): Promise<Date | null | undefined> {
  const [row] = await db
    .select({ at: schema.mods.unreviewedPageAt })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  return row?.at
}

async function reject(versionId: string) {
  await db.insert(schema.submissions).values({
    id: versionId,
    kind: 'mod',
    modVersionId: versionId,
    submittedBy: 'ada',
    status: 'rejected',
  })
}

describe('show-unreviewed-mod', () => {
  it('says what it would show, at which address, and changes nothing without --apply', async () => {
    await pack()

    expect(await run(['looks-pack'])).toEqual({
      exitCode: 0,
      lines: [
        'would show looks-pack at /mods/unreviewed/Ada/looks with 2 Desktop themes (dry run: add --apply)',
      ],
    })
    expect(await shownAt('looks-pack')).toBeNull()
  })

  it('shows it with --apply, and keeps its first time when run again', async () => {
    await pack()

    expect(await run(['looks-pack', '--apply'])).toEqual({
      exitCode: 0,
      lines: ['showed looks-pack at /mods/unreviewed/Ada/looks with 2 Desktop themes'],
    })
    const first = await shownAt('looks-pack')
    expect(first).toBeInstanceOf(Date)

    expect(await run(['looks-pack', '--apply'])).toEqual({
      exitCode: 0,
      lines: ['unchanged looks-pack: already shown at /mods/unreviewed/Ada/looks'],
    })
    expect(await shownAt('looks-pack')).toEqual(first)
  })

  it.each<[string, () => Promise<unknown>, CurationEntry[], string]>([
    [
      'a published mod',
      async () => {
        const { modId } = await pack()
        await db.update(schema.mods).set({ status: 'published' }).where(eq(schema.mods.id, modId))
      },
      [ENTRY],
      'it is published, not a draft',
    ],
    [
      "a user's submission",
      async () => {
        const { versionId } = await pack()
        await db.insert(schema.submissions).values({
          id: versionId,
          kind: 'mod',
          modVersionId: versionId,
          submittedBy: 'ada',
          status: 'pending',
        })
      },
      [ENTRY],
      'a user submitted it: review it on /admin',
    ],
    [
      'a draft with no curation entry for its folder and plugin name',
      () => pack(),
      [{ ...ENTRY, pluginName: 'other' }],
      'src/mods/curation.json has no entry for its folder and plugin name',
    ],
    [
      "a draft at another commit than the curation file's",
      () => pack(),
      [{ ...ENTRY, commitSha: sha('e') }],
      `its live commit ${sha('f')} is not the curation file's ${sha('e')}`,
    ],
    [
      'a draft with no Desktop theme',
      () =>
        addShownDraft(db, {
          slug: 'looks-pack',
          pluginName: 'looks',
          repoUrl: REPO,
          path: 'plugins/looks',
          shown: false,
        }),
      [ENTRY],
      'its live version declares no Desktop theme',
    ],
    [
      'a draft with a theme not yet recorded',
      async () => {
        const { versionId } = await pack()
        await addDesktopTheme(db, versionId, { key: 'rainy', rendered: false })
      },
      [ENTRY],
      'its live version is not fully recorded: render it first',
    ],
    [
      'a folder statuslin.es removed',
      async () => {
        await pack()
        const old = await addMod(db, 'old-looks', 'removed')
        await addVersion(db, old, {
          commitSha: sha('a'),
          versionNumber: 1,
          repoUrl: REPO,
          path: 'plugins/looks',
        })
      },
      [ENTRY],
      'statuslin.es removed this mod',
    ],
    [
      'a folder with a rejected submission',
      async () => {
        await pack()
        const other = await addMod(db, 'submitted-looks', 'draft')
        await reject(
          await addVersion(db, other, {
            commitSha: sha('a'),
            versionNumber: 1,
            repoUrl: REPO,
            path: 'plugins/looks',
          }),
        )
      },
      [ENTRY],
      'statuslin.es rejected a submission of this mod',
    ],
    [
      "an address an unreviewed mods row already has, whatever the owner's case",
      async () => {
        await pack()
        await db.insert(schema.unreviewedMods).values({
          owner: 'ada',
          pluginName: 'looks',
          description: '',
          repoUrl: 'https://github.com/ada/other-looks',
          path: '',
          commitSha: sha('c'),
          committedAt: new Date('2026-11-01T00:00:00Z'),
          license: null,
          stars: 0,
          footprint: { events: [], calls: [] },
          validatedWith: '2.1.0',
        })
      },
      [ENTRY],
      '/mods/unreviewed/Ada/looks already belongs to another mod',
    ],
    [
      'an address another shown draft already has',
      async () => {
        await pack()
        await addShownDraft(db, {
          slug: 'twin-looks',
          pluginName: 'looks',
          repoUrl: REPO,
          path: 'plugins/twin',
        })
      },
      [ENTRY],
      '/mods/unreviewed/Ada/looks already belongs to another mod',
    ],
  ])('refuses %s, saying why, and shows nothing', async (_name, seed, curation, reason) => {
    await seed()

    expect(await run(['looks-pack', '--apply'], curation)).toEqual({
      exitCode: 1,
      lines: [`refused looks-pack: ${reason}`],
    })
    expect(await shownAt('looks-pack')).toBeNull()
  })

  it('refuses a slug no mod has', async () => {
    expect(await run(['nope', '--apply'])).toEqual({
      exitCode: 1,
      lines: ['refused nope: no mod has this slug'],
    })
  })

  it('shows the slugs it can and refuses the rest, then exits 1', async () => {
    await pack()

    const { exitCode, lines } = await run(['nope', 'looks-pack', '--apply'])

    expect(exitCode).toBe(1)
    expect(lines).toEqual([
      'refused nope: no mod has this slug',
      'showed looks-pack at /mods/unreviewed/Ada/looks with 2 Desktop themes',
    ])
    expect(await shownAt('looks-pack')).toBeInstanceOf(Date)
  })

  it('hides a shown page with --hide --apply, and only says so without --apply', async () => {
    await pack()
    await run(['looks-pack', '--apply'])

    expect(await run(['looks-pack', '--hide'])).toEqual({
      exitCode: 0,
      lines: ['would hide looks-pack (dry run: add --apply)'],
    })
    expect(await shownAt('looks-pack')).toBeInstanceOf(Date)

    expect(await run(['looks-pack', '--hide', '--apply'])).toEqual({
      exitCode: 0,
      lines: ['hid looks-pack'],
    })
    expect(await shownAt('looks-pack')).toBeNull()
  })

  it('prints its usage and exits 1 without a slug', async () => {
    const { exitCode, lines } = await run(['--apply'])

    expect(exitCode).toBe(1)
    expect(lines[0]).toMatch(/^Usage: bun run show:unreviewed-mods/)
  })
})
