import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { CommitComparison } from '@/mods/github'
import { PluginRefusal } from '@/mods/plugin-facts'
import { type ModSubmitDeps, submitMod } from '@/mods/submit'
import { createSubmitGuard } from '@/mods/submit-guard'
import type { ModSandbox, ModSource } from '@/render/mods/mod-sandbox'
import { MODULES_ONLY_LISTING, openTestDb, sha, type TestDb } from './seed-mods'

const REPO = 'https://github.com/octocat/mods'
const LINK = `${REPO}/tree/main/plugins/meter`
const VALIDATE = readFileSync(new URL('./fixtures/validate-skins.json', import.meta.url), 'utf8')

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  for (const id of ['ada', 'bob']) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@test.com` })
  }
})
beforeEach(async () => {
  await db.delete(schema.mods)
  await db.delete(schema.submissions)
})
afterAll(async () => {
  await close()
})

interface FakeOptions {
  head?: string
  manifest?: Record<string, unknown>
  fetchError?: Error
  sandboxError?: Error
  comparedToLive?: CommitComparison
}

function deps({
  head = sha('a'),
  manifest = { name: 'meter', version: '1.0.0', description: 'A context meter.' },
  fetchError,
  sandboxError,
  comparedToLive = 'ahead',
}: FakeOptions = {}): ModSubmitDeps & { calls: string[] } {
  const calls: string[] = []
  const sandbox: ModSandbox = {
    pluginDir: '/home/user/plugins/mod',
    async run(command) {
      const stdout = command.endsWith('--version')
        ? '2.1.296 (Claude Code)\n'
        : command.includes(' plugin validate --json ')
          ? VALIDATE
          : command.includes('hooks/hooks.json')
            ? MODULES_ONLY_LISTING
            : JSON.stringify(manifest)
      return { exitCode: 0, stdout, stderr: '' }
    },
  }
  return {
    calls,
    guard: createSubmitGuard({ perUserPerHour: 100, inFlight: 10 }),
    github: {
      async findRepo() {
        calls.push('repo')
        return { fullName: 'octocat/mods', license: 'MIT', defaultBranch: 'main' }
      },
      async resolveCommit(_repo, ref) {
        calls.push(`ref:${ref}`)
        return ref === 'main' || ref === 'HEAD' ? head : null
      },
      async commitIsOnDefaultBranch() {
        return true
      },
      async compareCommits(_repo, base, head) {
        calls.push(`compare:${base}...${head}`)
        return comparedToLive
      },
      async pluginManifestExists() {
        return true
      },
    },
    async fetchPlugin({ commitSha }) {
      calls.push(`fetch:${commitSha}`)
      if (fetchError) throw fetchError
      return new Uint8Array([31, 139])
    },
    async withSandbox<T>(_source: ModSource, use: (s: ModSandbox) => Promise<T>) {
      if (sandboxError) throw sandboxError
      return use(sandbox)
    },
  }
}

const submit = (
  {
    by = 'ada',
    link = LINK,
    ...rest
  }: { link?: string; title?: string; slug?: string; by?: string } = {},
  d = deps(),
) => submitMod(db, { submittedBy: by, link, ...rest }, d)

async function modBySlug(slug: string) {
  const [mod] = await db.select().from(schema.mods).where(eq(schema.mods.slug, slug))
  return mod
}

async function modById(id: string) {
  const [mod] = await db.select().from(schema.mods).where(eq(schema.mods.id, id))
  return mod
}

const PROVISIONAL = /^meter-[0-9a-f]{6}$/

async function submissionsOf(modId: string) {
  return db
    .select({
      versionNumber: schema.modVersions.versionNumber,
      status: schema.submissions.status,
      rejectionEmailStatus: schema.submissions.rejectionEmailStatus,
    })
    .from(schema.modVersions)
    .innerJoin(schema.submissions, eq(schema.submissions.modVersionId, schema.modVersions.id))
    .where(eq(schema.modVersions.modId, modId))
    .orderBy(schema.modVersions.versionNumber)
}

describe('submitMod', () => {
  it('writes a draft mod pinned to the commit, credited to the repository owner', async () => {
    const result = await submit()

    expect(result).toMatchObject({
      slug: expect.stringMatching(PROVISIONAL),
      commitSha: sha('a'),
      ref: 'main',
      isUpdate: false,
    })
    const mod = await modById(result.modId)
    expect(mod).toMatchObject({
      slug: result.slug,
      pluginName: 'meter',
      title: 'meter',
      description: 'A context meter.',
      authorGithub: 'octocat',
      status: 'draft',
      currentVersionId: result.versionId,
    })
    const [version] = await db
      .select()
      .from(schema.modVersions)
      .where(eq(schema.modVersions.id, result.versionId))
    expect(version).toMatchObject({
      repoUrl: REPO,
      path: 'plugins/meter',
      commitSha: sha('a'),
      pluginVersion: '1.0.0',
      license: 'MIT',
      inputSteps: [],
    })
    const [submission] = await db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, result.versionId))
    expect(submission).toMatchObject({ kind: 'mod', submittedBy: 'ada', status: 'pending' })
  })

  it('takes the typed title', async () => {
    const { modId } = await submit({ title: '  Context meter ' })

    expect((await modById(modId))?.title).toBe('Context meter')
  })

  it('names the draft provisionally, so a submission holds no marketplace name until approved', async () => {
    const first = await submit({ by: 'bob' })

    const second = await submit({}, deps({ head: sha('b') }))

    expect(first.slug).toMatch(PROVISIONAL)
    expect(second.slug).toMatch(PROVISIONAL)
    expect(second.slug).not.toBe(first.slug)
  })

  it.each(['pending', 'rejected'] as const)(
    "lets the author submit a folder someone else's %s submission names",
    async (status) => {
      const other = await submit({ by: 'bob' })
      await db
        .update(schema.submissions)
        .set({ status })
        .where(eq(schema.submissions.id, other.versionId))

      const own = await submit()

      expect(own).toMatchObject({ commitSha: other.commitSha, isUpdate: false })
      expect(own.modId).not.toBe(other.modId)
    },
  )

  it('refuses past the rate limit before asking GitHub anything', async () => {
    for (const [i, char] of ['b', 'c', 'd'].entries()) {
      const link = `${REPO}/tree/main/plugins/meter-${i}`
      await submit({ link }, deps({ head: sha(char), manifest: { name: `meter-${i}` } }))
    }
    const d = deps({ head: sha('e') })

    await expect(submit({}, d)).rejects.toMatchObject({ status: 429 })
    expect(d.calls).toEqual([])
  })

  it('refuses a commit that is already submitted', async () => {
    await submit()

    await expect(submit()).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/already submitted/),
    })
  })

  it('refuses a plugin folder over the fetch caps, saying to trim it', async () => {
    const d = deps({
      fetchError: new Error(
        `${REPO} folder "plugins/meter" at ${sha('a')} has more than 2000 files`,
      ),
    })

    await expect(submit({}, d)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/plugin folder is over 2,000 files or 20 MB/),
    })
  })

  it('refuses a plugin that fails validation', async () => {
    const d = deps({ sandboxError: new PluginRefusal('claude plugin validate failed: bad hook') })

    await expect(submit({}, d)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/bad hook/),
    })
    expect(await db.select().from(schema.mods)).toEqual([])
  })

  it('cuts a long refusal short', async () => {
    const d = deps({ sandboxError: new PluginRefusal(`validate failed: ${'x'.repeat(5000)}`) })

    const refused = await submit({}, d).catch((error: unknown) => error)
    expect(refused).toMatchObject({ status: 400 })
    expect((refused as Error).message.length).toBeLessThanOrEqual(1100)
  })

  it('reports a failure of its own, such as the sandbox not starting, as a 500, not a refusal', async () => {
    const d = deps({ sandboxError: new Error('E2B: 502 Bad Gateway') })

    const failed = await submit({}, d).catch((error: unknown) => error)
    expect(failed).toBeInstanceOf(Error)
    expect(failed).not.toHaveProperty('status')
  })

  it.each(['published', 'removed', 'draft'] as const)(
    'refuses a second listing of a folder a %s curated mod holds, without downloading it',
    async (status) => {
      const [mod] = await db
        .insert(schema.mods)
        .values({
          slug: 'curated',
          pluginName: 'meter',
          title: 'Meter',
          authorGithub: 'octocat',
          status,
        })
        .returning()
      await db.insert(schema.modVersions).values({
        modId: mod!.id,
        versionNumber: 1,
        repoUrl: REPO,
        path: 'plugins/meter',
        commitSha: sha('f'),
        footprint: { events: [], calls: [] },
        validatedWith: '2.1.0',
      })
      const d = deps()

      await expect(submit({}, d)).rejects.toMatchObject({
        status: 409,
        message: expect.stringMatching(/already listed as "curated"/),
      })
      expect(d.calls.filter((c) => c.startsWith('fetch'))).toEqual([])
    },
  )

  it('refuses through the guard when the submitter already has a check running', async () => {
    const d = deps()
    d.guard = { run: async () => Promise.reject(Object.assign(new Error('busy'), { status: 429 })) }

    await expect(submit({}, d)).rejects.toMatchObject({ status: 429 })
    expect(d.calls).toEqual([])
  })
})

describe('a new version of your own mod', () => {
  async function published(d = deps()) {
    const first = await submit({}, d)
    // Approval names it.
    await db
      .update(schema.mods)
      .set({ status: 'published', slug: 'meter' })
      .where(eq(schema.mods.id, first.modId))
    await db
      .update(schema.submissions)
      .set({ status: 'approved' })
      .where(eq(schema.submissions.id, first.versionId))
    return first
  }

  it('adds an update to a published mod and leaves the live version live', async () => {
    const first = await published()

    const update = await submit({ slug: 'meter', link: LINK }, deps({ head: sha('b') }))

    expect(update).toMatchObject({ slug: 'meter', isUpdate: true, commitSha: sha('b') })
    expect(await modBySlug('meter')).toMatchObject({
      status: 'published',
      currentVersionId: first.versionId,
    })
    expect(await submissionsOf(first.modId)).toEqual([
      { versionNumber: 1, status: 'approved', rejectionEmailStatus: null },
      { versionNumber: 2, status: 'pending', rejectionEmailStatus: null },
    ])
  })

  it('compares an update with the live commit, and a first submission with nothing', async () => {
    const firstDeps = deps()
    await published(firstDeps)
    const updateDeps = deps({ head: sha('b') })

    await submit({ slug: 'meter' }, updateDeps)

    const compares = (calls: string[]) => calls.filter((c) => c.startsWith('compare:'))
    expect(compares(firstDeps.calls)).toEqual([])
    expect(compares(updateDeps.calls)).toEqual([`compare:${sha('a')}...${sha('b')}`])
  })

  it.each([
    ['behind', 'Commit bbbbbbb is behind the live commit aaaaaaa.'],
    ['diverged', "Commit bbbbbbb doesn't build on the live commit aaaaaaa."],
  ] as const)(
    'refuses an update GitHub compares as %s, before downloading it',
    async (comparison, message) => {
      const first = await published()
      const d = deps({ head: sha('b'), comparedToLive: comparison })

      await expect(submit({ slug: 'meter' }, d)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining(message),
      })
      expect(d.calls.filter((c) => c.startsWith('fetch:'))).toEqual([])
      expect(await submissionsOf(first.modId)).toHaveLength(1)
    },
  )

  it('does not compare a fix to a rejected draft, which has no live version', async () => {
    const first = await submit()
    await db
      .update(schema.submissions)
      .set({ status: 'rejected', rejectionReason: 'No' })
      .where(eq(schema.submissions.id, first.versionId))
    const d = deps({ head: sha('b'), comparedToLive: 'behind' })

    await submit({ slug: first.slug }, d)

    expect(d.calls.filter((c) => c.startsWith('compare:'))).toEqual([])
  })

  it('replaces an older pending update', async () => {
    const first = await published()
    await submit({ slug: 'meter' }, deps({ head: sha('b') }))

    await submit({ slug: 'meter' }, deps({ head: sha('c') }))

    expect((await submissionsOf(first.modId)).map((s) => s.status)).toEqual([
      'approved',
      'superseded',
      'pending',
    ])
  })

  it('keeps the live title on an update', async () => {
    await published()

    await submit({ slug: 'meter', title: 'Renamed' }, deps({ head: sha('b') }))

    expect((await modBySlug('meter'))?.title).toBe('meter')
  })

  it('takes a fix to a rejected draft, with a new title, and withdraws the unsent rejection email', async () => {
    const first = await submit()
    await db
      .update(schema.submissions)
      .set({ status: 'rejected', rejectionReason: 'No', rejectionEmailStatus: 'failed' })
      .where(eq(schema.submissions.id, first.versionId))

    const fix = await submit({ slug: first.slug, title: 'Meter, fixed' }, deps({ head: sha('b') }))

    expect(fix.isUpdate).toBe(false)
    expect((await modById(first.modId))?.title).toBe('Meter, fixed')
    expect(await submissionsOf(first.modId)).toEqual([
      { versionNumber: 1, status: 'rejected', rejectionEmailStatus: 'superseded' },
      { versionNumber: 2, status: 'pending', rejectionEmailStatus: null },
    ])
  })

  it('refuses a new version while the first is still in review, before asking GitHub', async () => {
    const first = await submit()
    const d = deps({ head: sha('b') })

    await expect(submit({ slug: first.slug }, d)).rejects.toMatchObject({ status: 409 })
    expect(d.calls).toEqual([])
  })

  it.each([
    ['another user', { by: 'bob' }, 404],
    ['another folder', { link: `${REPO}/tree/main/plugins/other` }, 400],
  ])('refuses %s', async (_name, input, status) => {
    await published()

    await expect(
      submit({ slug: 'meter', ...input }, deps({ head: sha('b') })),
    ).rejects.toMatchObject({ status })
  })

  it('takes a fix to a rejected draft that renames the plugin', async () => {
    const first = await submit({}, deps({ manifest: { name: 'claude' } }))
    await db
      .update(schema.submissions)
      .set({ status: 'rejected', rejectionReason: 'Rename the plugin' })
      .where(eq(schema.submissions.id, first.versionId))

    await submit({ slug: first.slug }, deps({ head: sha('b') }))

    expect((await modById(first.modId))?.pluginName).toBe('meter')
  })

  it('refuses an update whose plugin.json renames the published plugin', async () => {
    await published()
    const d = deps({ head: sha('b'), manifest: { name: 'gauge' } })

    await expect(submit({ slug: 'meter' }, d)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/"gauge", not "meter"/),
    })
  })

  it('refuses a curated mod, which has no submitter', async () => {
    const [mod] = await db
      .insert(schema.mods)
      .values({
        slug: 'curated',
        pluginName: 'meter',
        title: 'C',
        authorGithub: 'octocat',
        status: 'published',
      })
      .returning()
    const [version] = await db
      .insert(schema.modVersions)
      .values({
        modId: mod!.id,
        versionNumber: 1,
        repoUrl: REPO,
        path: 'plugins/meter',
        commitSha: sha('f'),
        footprint: { events: [], calls: [] },
        validatedWith: '2.1.0',
      })
      .returning()
    await db
      .update(schema.mods)
      .set({ currentVersionId: version!.id })
      .where(eq(schema.mods.id, mod!.id))

    await expect(submit({ slug: 'curated' }, deps({ head: sha('b') }))).rejects.toMatchObject({
      status: 404,
    })
  })
})
