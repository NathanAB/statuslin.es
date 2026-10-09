import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from '@/adopt/install'
import { listPublishedSlugsMissingContent } from '@/content/generation-workflow'
import * as schema from '@/db/schema'
import { getFacetPage, llmsTxtResponseForRoute } from '@/gallery/functions'
import {
  getCardsByCopies,
  getConfigBySlug,
  getPublishedConfigs,
  getPublishedSlugsForSitemap,
  getRelatedConfigs,
} from '@/gallery/queries'
import { configCardResponse } from '@/og/routes'
import { FakeSandboxRunner } from '@/render/fake-runner'
import {
  approveAndEmailVersion,
  approveVersion,
  rejectAndEmailVersion,
  retryRejectionEmail,
} from '@/review/decide'
import { getMySubmissionRows } from '@/review/my-submissions'
import { getDashboardRows } from '@/review/queue'
import { type SubmitInput, submitConfig } from '@/submit/submit'
import { processNextRenderJob } from '@/submit/worker'
import { removeConfig } from '../../scripts/remove-config'

const configCard = vi.hoisted(() => vi.fn(() => null))
vi.mock('@/og/card', () => ({ configCard, homeCard: vi.fn(() => null) }))
vi.mock('@/og/render', () => ({ toElementPng: vi.fn(async () => new Uint8Array([1])) }))
const testState = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testState.db
  },
}))
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (handler: () => unknown) => handler,
  createServerFn: () => {
    const wrap = (handler: (args: { data: unknown }) => unknown) => (args?: { data?: unknown }) =>
      handler({ data: args?.data })
    return {
      handler: wrap,
      inputValidator: (validator: (data: never) => unknown) => ({
        handler: (handler: (args: { data: unknown }) => unknown) => (args: { data: never }) =>
          handler({ data: validator(args.data) }),
      }),
    }
  },
}))
vi.mock('@/lib/http.server', () => ({
  withHttpStatus: (run: () => unknown) => run(),
}))

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  testState.db = db
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values(
    ['owner', 'neighbour'].map((id) => ({
      id,
      name: id,
      email: `${id}@test.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  )
})

afterAll(async () => {
  await client.close()
})

beforeEach(async () => {
  await db.delete(schema.configs)
})

const live: SubmitInput = {
  authorId: 'owner',
  title: 'Live line',
  description: 'Live description',
  interpreter: 'bash',
  source: 'echo live',
  networkHosts: [],
}
const update: SubmitInput = {
  ...live,
  title: 'Updated line',
  description: 'Updated description',
  interpreter: 'python',
  source: 'print("updated")',
}

const sentEmail = () => vi.fn().mockResolvedValue({ id: 'email_1' })

async function render() {
  await processNextRenderJob(db, new FakeSandboxRunner())
}

async function publish(input: SubmitInput = live) {
  const result = await submitConfig(db, input)
  await render()
  await approveVersion(db, result.versionId, 'admin')
  return result
}

async function submitUpdate(slug: string, input: SubmitInput = update) {
  const result = await submitConfig(db, input, { updateSlug: slug })
  await render()
  return result
}

const configRow = async (configId: string) =>
  (await db.select().from(schema.configs).where(eq(schema.configs.id, configId)))[0]
const versionRow = async (versionId: string) =>
  (await db.select().from(schema.configVersions).where(eq(schema.configVersions.id, versionId)))[0]

describe('approving an update', () => {
  it('switches every public read to the new version at the same slug', async () => {
    const v1 = await publish()
    await publish({ ...live, authorId: 'neighbour', title: 'Neighbour line' })
    await db.update(schema.configs).set({ copyCount: 7 }).where(eq(schema.configs.id, v1.configId))
    const v2 = await submitUpdate(v1.slug)

    await approveVersion(db, v2.versionId, 'admin')

    const detail = await getConfigBySlug(db, v1.slug)
    expect(detail).toMatchObject({
      slug: v1.slug,
      title: update.title,
      description: update.description,
      interpreter: update.interpreter,
      source: update.source,
      copyCount: 7,
    })
    expect(runCommand(detail!.interpreter, detail!.source)).toBe(
      runCommand(update.interpreter, update.source),
    )
    const cards = [...(await getPublishedConfigs(db, 'new')), ...(await getCardsByCopies(db))]
    const updatedCards = cards.filter((card) => card.slug === v1.slug)
    expect(updatedCards).toHaveLength(2)
    for (const card of updatedCards) expect(card).toMatchObject({ title: update.title })
    const neighbourSlug = cards.find((card) => card.slug !== v1.slug)!.slug
    expect(
      (await getRelatedConfigs(db, neighbourSlug)).find((r) => r.slug === v1.slug),
    ).toMatchObject({ title: update.title, interpreter: update.interpreter })
    await configCardResponse(db, v1.slug)
    expect(configCard).toHaveBeenLastCalledWith(expect.objectContaining({ title: update.title }))
    const llms = await (await llmsTxtResponseForRoute()).text()
    expect(llms).toContain(`[${update.title}]`)
    expect(llms).toContain(update.description)
    expect(llms).not.toContain(live.title)
    const pythonFacet = await getFacetPage({ data: { facet: 'python' } })
    expect(pythonFacet?.cards.find((card) => card.slug === v1.slug)).toMatchObject({
      title: update.title,
    })
    const bashFacet = await getFacetPage({ data: { facet: 'bash' } })
    expect(bashFacet?.cards.map((card) => card.slug)).not.toContain(v1.slug)
  })

  it('keeps the config in place in the new sort', async () => {
    const older = await publish()
    const newer = await publish({ ...live, authorId: 'neighbour', title: 'Newer line' })
    const v2 = await submitUpdate(older.slug)

    await approveVersion(db, v2.versionId, 'admin')

    const slugs = (await getPublishedConfigs(db, 'new')).map((card) => card.slug)
    expect(slugs).toEqual([newer.slug, older.slug])
  })

  it('moves the sitemap lastmod and the Updated date to the update approval', async () => {
    const v1 = await publish()
    const before = await getConfigBySlug(db, v1.slug)
    const approvedAt = new Date('2099-01-02T03:04:05Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(approvedAt)
    try {
      const v2 = await submitUpdate(v1.slug)
      await approveVersion(db, v2.versionId, 'admin')
    } finally {
      vi.useRealTimers()
    }

    const sitemapRow = (await getPublishedSlugsForSitemap(db)).find((r) => r.slug === v1.slug)
    expect(sitemapRow?.updatedAt).toEqual(approvedAt)
    const after = await getConfigBySlug(db, v1.slug)
    expect(after?.updatedAt).toBe('2099-01-02')
    expect(after?.updatedAt).not.toBe(before?.updatedAt)
  })

  it('leaves a config taken down during review removed', async () => {
    const v1 = await publish()
    const v2 = await submitUpdate(v1.slug)
    await removeConfig(db, v1.slug)
    const send = sentEmail()

    await expect(approveAndEmailVersion(db, v2.versionId, 'admin', send)).resolves.toEqual({
      delivery: 'unavailable',
    })

    expect(send).not.toHaveBeenCalled()
    expect((await configRow(v1.configId))?.status).toBe('removed')
    expect(await getConfigBySlug(db, v1.slug)).toBeNull()
    expect((await getPublishedConfigs(db, 'new')).map((card) => card.slug)).not.toContain(v1.slug)
  })

  it('lists the slug for generate:content again', async () => {
    const v1 = await publish()
    const firstLive = (await configRow(v1.configId))?.currentVersionId
    await db
      .update(schema.configVersions)
      .set({ generatedContent: { schemaVersion: 1 } as never })
      .where(eq(schema.configVersions.id, firstLive!))
    expect(await listPublishedSlugsMissingContent(db)).not.toContain(v1.slug)
    const v2 = await submitUpdate(v1.slug)

    await approveVersion(db, v2.versionId, 'admin')

    expect(await listPublishedSlugsMissingContent(db)).toContain(v1.slug)
  })

  it('emails the author that the update is live, with the new title', async () => {
    const v1 = await publish()
    const v2 = await submitUpdate(v1.slug)
    const send = sentEmail()

    await expect(approveAndEmailVersion(db, v2.versionId, 'admin', send)).resolves.toEqual({
      delivery: 'sent',
    })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'update', title: update.title, slug: v1.slug }),
    )
  })

  it('keeps first-publish approval emails as submissions', async () => {
    const v1 = await submitConfig(db, live)
    await render()
    const send = sentEmail()

    await approveAndEmailVersion(db, v1.versionId, 'admin', send)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'submission', title: live.title }),
    )
  })
})

describe('rejecting an update', () => {
  it('keeps the live version and delivers the update rejection email', async () => {
    const v1 = await publish()
    const v2 = await submitUpdate(v1.slug)
    const send = sentEmail()

    await expect(
      rejectAndEmailVersion(db, v2.versionId, 'admin', 'Breaks on macOS', send),
    ).resolves.toEqual({ delivery: 'sent' })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'update',
        title: live.title,
        reason: 'Breaks on macOS',
        slug: v1.slug,
      }),
    )
    expect(await getConfigBySlug(db, v1.slug)).toMatchObject({
      title: live.title,
      source: live.source,
    })
    expect((await getDashboardRows(db)).map((row) => row.version.id)).not.toContain(v2.versionId)
  })

  it('shows the rejection on /me under the published card', async () => {
    const v1 = await publish()
    const v2 = await submitUpdate(v1.slug)
    await rejectAndEmailVersion(db, v2.versionId, 'admin', 'Breaks on macOS', sentEmail())

    const [row] = await getMySubmissionRows(db, 'owner')
    expect(row?.config.status).toBe('published')
    expect(row?.version.title).toBe(live.title)
    expect(row?.update).toEqual({
      versionNumber: 2,
      status: 'rejected',
      renderStatus: 'done',
      rejectionReason: 'Breaks on macOS',
    })
  })

  it('lets the author submit a new update that retires the undelivered rejection', async () => {
    const v1 = await publish()
    const v2 = await submitUpdate(v1.slug)
    const failed = vi.fn().mockRejectedValue(new Error('network'))
    await rejectAndEmailVersion(db, v2.versionId, 'admin', 'Breaks on macOS', failed)

    const v3 = await submitConfig(db, { ...update, title: 'Fixed line' }, { updateSlug: v1.slug })

    expect(v3.slug).toBe(v1.slug)
    expect(await versionRow(v3.versionId)).toMatchObject({ versionNumber: 3, status: 'pending' })
    expect((await versionRow(v2.versionId))?.rejectionEmailStatus).toBe('superseded')
    await expect(retryRejectionEmail(db, v2.versionId, sentEmail())).rejects.toMatchObject({
      status: 409,
    })
  })
})
