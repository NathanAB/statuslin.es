import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import {
  approveAndEmailVersion,
  approveVersion,
  rejectAndEmailVersion,
  rejectVersion,
  requeueRenderJob,
  retryApprovalEmail,
  retryRejectionEmail,
  runNetworkPreview,
  setReadsClaudeToken,
} from '@/review/decide'
import { submitConfig } from '@/submit/submit'
import { processNextRenderJob } from '@/submit/worker'

async function seedVersionWithJob(
  db: ReturnType<typeof drizzle<typeof schema>>,
  opts: { status: 'queued' | 'running' | 'done' | 'failed' | 'held'; networkHosts: string[] },
): Promise<string> {
  // assumes an author 'u1' is seeded in beforeAll, like the other DB tests
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug: `s-${Date.now()}-${Math.random()}`,
      title: 'T',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
    })
    .returning()
  if (!cfg) throw new Error('no config')
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      source: '#!/bin/bash\necho hi',
      interpreter: 'bash',
      contentSha256: `sha-${Math.random()}`,
      status: 'pending',
      networkHosts: opts.networkHosts,
    })
    .returning()
  if (!ver) throw new Error('no version')
  await db.insert(schema.renderJobs).values({ configVersionId: ver.id, status: opts.status })
  return ver.id
}

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  // Seed the author referenced by the configs FK (author_id → user.id)
  await db
    .insert(schema.user)
    .values({
      id: 'u1',
      name: 'Author One',
      email: 'author1@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})
// Each test submits as the shared author 'u1'; clear configs between tests so the per-author
// rate limit doesn't accumulate across them (cascades to versions, render jobs, votes, copies).
beforeEach(async () => {
  await db.delete(schema.configs)
})

describe('approveVersion', () => {
  it('approves the version and publishes the config after render is done', async () => {
    const { configId, versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'A',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())
    await approveVersion(db, versionId, 'admin1')
    const vRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    const v = vRows[0]
    expect(v?.status).toBe('approved')
    expect(v?.reviewedBy).toBe('admin1')
    const cRows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    const c = cRows[0]
    expect(c?.status).toBe('published')
    expect(c?.currentVersionId).toBe(versionId)
  })

  it('throws if the render job is not done', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'B',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await expect(approveVersion(db, versionId, 'admin1')).rejects.toMatchObject({ status: 409 })
  })
})

describe('approval email delivery', () => {
  it('emails the verified author after publishing and stores the Resend id', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { configId, versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Approved status line',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())
    const send = vi.fn().mockResolvedValue({ id: 'email_approved' })

    const result = await approveAndEmailVersion(db, versionId, 'admin1', send)

    expect(result).toEqual({ delivery: 'sent' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId,
        authorName: 'Author One',
        authorEmail: 'author1@test.com',
        title: 'Approved status line',
      }),
    )
    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      status: 'approved',
      approvalEmailStatus: 'sent',
      approvalEmailId: 'email_approved',
      approvalEmailError: null,
    })
    expect(version?.approvalEmailSentAt).toBeInstanceOf(Date)
    const [config] = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(config?.status).toBe('published')
    expect(config?.currentVersionId).toBe(versionId)
  })

  it('keeps the version published and stores a safe failure when delivery throws', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { configId, versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Published despite email',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())

    const result = await approveAndEmailVersion(
      db,
      versionId,
      'admin1',
      vi.fn().mockRejectedValue(new Error('provider leaked author1@test.com')),
    )

    expect(result).toEqual({ delivery: 'failed' })
    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      status: 'approved',
      approvalEmailStatus: 'failed',
      approvalEmailError: 'Email delivery failed',
    })
    const [config] = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(config?.status).toBe('published')
    expect(config?.currentVersionId).toBe(versionId)
  })

  it('marks delivery unavailable without calling the sender for an unverified email', async () => {
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'No verified approval email',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())
    const send = vi.fn()

    const result = await approveAndEmailVersion(db, versionId, 'admin1', send)

    expect(result).toEqual({ delivery: 'unavailable' })
    expect(send).not.toHaveBeenCalled()
  })

  it('retries a failed approval email and rejects another retry after it is sent', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Retry approval email',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())
    await approveAndEmailVersion(
      db,
      versionId,
      'admin1',
      vi.fn().mockRejectedValue(new Error('offline')),
    )
    const send = vi.fn().mockResolvedValue({ id: 'email_retry_approved' })

    const result = await retryApprovalEmail(db, versionId, send)

    expect(result).toEqual({ delivery: 'sent' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ versionId }))
    await expect(retryApprovalEmail(db, versionId, send)).rejects.toMatchObject({ status: 409 })
  })

  it('rejects retry for a version that is not approved', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Pending approval',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })

    await expect(retryApprovalEmail(db, versionId, vi.fn())).rejects.toMatchObject({ status: 409 })
  })

  it('does not send for a legacy approved version without approval delivery state', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Legacy approval',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await db
      .update(schema.configVersions)
      .set({ status: 'approved', approvalEmailStatus: null })
      .where(eq(schema.configVersions.id, versionId))
    const send = vi.fn()

    await expect(retryApprovalEmail(db, versionId, send)).rejects.toMatchObject({ status: 409 })
    expect(send).not.toHaveBeenCalled()
  })

  it('does not let a late concurrent failure overwrite sent delivery', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Concurrent approval retry',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await processNextRenderJob(db, new FakeSandboxRunner())
    await approveAndEmailVersion(
      db,
      versionId,
      'admin1',
      vi.fn().mockRejectedValue(new Error('offline')),
    )

    let resolveSuccess!: (value: { id: string }) => void
    let rejectFailure!: (reason: Error) => void
    let markSuccessStarted!: () => void
    let markFailureStarted!: () => void
    const successResult = new Promise<{ id: string }>((resolve) => {
      resolveSuccess = resolve
    })
    const failureResult = new Promise<{ id: string }>((_resolve, reject) => {
      rejectFailure = reject
    })
    const successStarted = new Promise<void>((resolve) => {
      markSuccessStarted = resolve
    })
    const failureStarted = new Promise<void>((resolve) => {
      markFailureStarted = resolve
    })

    const successfulRetry = retryApprovalEmail(db, versionId, () => {
      markSuccessStarted()
      return successResult
    })
    const failingRetry = retryApprovalEmail(db, versionId, () => {
      markFailureStarted()
      return failureResult
    })
    await Promise.all([successStarted, failureStarted])
    resolveSuccess({ id: 'email_approval_won' })
    await successfulRetry
    rejectFailure(new Error('late failure'))
    await failingRetry

    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      approvalEmailStatus: 'sent',
      approvalEmailId: 'email_approval_won',
      approvalEmailError: null,
    })
  })
})

describe('rejectVersion', () => {
  it('rejects the version, leaves the config unpublished', async () => {
    const { configId, versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'R',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await rejectVersion(db, versionId, 'admin1', 'The script needs changes.')
    const vRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    const v = vRows[0]
    expect(v?.status).toBe('rejected')
    const cRows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    const c = cRows[0]
    expect(c?.status).toBe('draft')
  })

  it('requires a non-blank rejection reason', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Blank reason',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })

    await expect(rejectVersion(db, versionId, 'admin1', '   ')).rejects.toMatchObject({
      status: 400,
    })
  })

  it('rejects a reason longer than 2,000 characters', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Long reason',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })

    await expect(rejectVersion(db, versionId, 'admin1', 'x'.repeat(2001))).rejects.toMatchObject({
      status: 400,
    })
  })

  it('stores a trimmed rejection reason with pending email delivery', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Stored reason',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })

    await rejectVersion(db, versionId, 'admin1', '  Remove the updater.  ')

    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Remove the updater.',
      rejectionEmailStatus: 'pending',
    })
  })

  it('throws when rejecting a non-existent version', async () => {
    await expect(
      rejectVersion(db, '00000000-0000-0000-0000-000000000000', 'admin1', 'Not accepted.'),
    ).rejects.toThrow('version not in a reviewable (pending) state')
  })
})

describe('rejection email delivery', () => {
  it('emails the verified author and stores the Resend id', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Email success',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    const send = vi.fn().mockResolvedValue({ id: 'email_123' })

    const result = await rejectAndEmailVersion(db, versionId, 'admin1', 'Remove the updater.', send)

    expect(result).toEqual({ delivery: 'sent' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId,
        authorName: 'Author One',
        authorEmail: 'author1@test.com',
        title: 'Email success',
        reason: 'Remove the updater.',
      }),
    )
    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      status: 'rejected',
      rejectionEmailStatus: 'sent',
      rejectionEmailId: 'email_123',
      rejectionEmailError: null,
    })
    expect(version?.rejectionEmailSentAt).toBeInstanceOf(Date)
  })

  it('keeps the rejection and stores a safe failure when delivery throws', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Email failure',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    const send = vi.fn().mockRejectedValue(new Error('provider leaked author1@test.com'))

    const result = await rejectAndEmailVersion(db, versionId, 'admin1', 'Fix it.', send)

    expect(result).toEqual({ delivery: 'failed' })
    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Fix it.',
      rejectionEmailStatus: 'failed',
      rejectionEmailError: 'Email delivery failed',
    })
  })

  it('marks delivery unavailable without calling the sender for an unverified email', async () => {
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'No verified email',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    const send = vi.fn()

    const result = await rejectAndEmailVersion(db, versionId, 'admin1', 'Fix it.', send)

    expect(result).toEqual({ delivery: 'unavailable' })
    expect(send).not.toHaveBeenCalled()
  })

  it('retries a failed rejection email using the stored reason', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Retry email',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await rejectAndEmailVersion(
      db,
      versionId,
      'admin1',
      'Use a pinned source.',
      vi.fn().mockRejectedValue(new Error('offline')),
    )
    const send = vi.fn().mockResolvedValue({ id: 'email_retry' })

    const result = await retryRejectionEmail(db, versionId, send)

    expect(result).toEqual({ delivery: 'sent' })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ versionId, reason: 'Use a pinned source.' }),
    )
  })

  it('does not let a late concurrent failure overwrite sent delivery', async () => {
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, 'u1'))
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Concurrent retry',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await rejectAndEmailVersion(
      db,
      versionId,
      'admin1',
      'Use a pinned source.',
      vi.fn().mockRejectedValue(new Error('offline')),
    )

    let resolveSuccess!: (value: { id: string }) => void
    let rejectFailure!: (reason: Error) => void
    let markSuccessStarted!: () => void
    let markFailureStarted!: () => void
    const successResult = new Promise<{ id: string }>((resolve) => {
      resolveSuccess = resolve
    })
    const failureResult = new Promise<{ id: string }>((_resolve, reject) => {
      rejectFailure = reject
    })
    const successStarted = new Promise<void>((resolve) => {
      markSuccessStarted = resolve
    })
    const failureStarted = new Promise<void>((resolve) => {
      markFailureStarted = resolve
    })

    const successfulRetry = retryRejectionEmail(db, versionId, () => {
      markSuccessStarted()
      return successResult
    })
    const failingRetry = retryRejectionEmail(db, versionId, () => {
      markFailureStarted()
      return failureResult
    })
    await Promise.all([successStarted, failureStarted])
    resolveSuccess({ id: 'email_won' })
    await successfulRetry
    rejectFailure(new Error('late failure'))
    await failingRetry

    const [version] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(version).toMatchObject({
      rejectionEmailStatus: 'sent',
      rejectionEmailId: 'email_won',
      rejectionEmailError: null,
    })
  })
})

describe('requeueRenderJob', () => {
  it('resets a failed render job to queued, clearing error/attempts/finishedAt', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'Requeue',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'failed', error: 'boom', attempts: 3, finishedAt: new Date() })
      .where(eq(schema.renderJobs.configVersionId, versionId))

    await requeueRenderJob(db, versionId)

    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
    expect(job?.error).toBeNull()
    expect(job?.attempts).toBe(0)
    expect(job?.finishedAt).toBeNull()
  })

  it('throws when there is no render job for the version', async () => {
    await expect(requeueRenderJob(db, '00000000-0000-0000-0000-000000000000')).rejects.toThrow()
  })

  it('refuses to re-queue an already-done render job', async () => {
    const { versionId } = await submitConfig(db, {
      authorId: 'u1',
      title: 'AlreadyDone',
      description: '',
      interpreter: 'bash',
      source: 'x',
    })
    await db
      .update(schema.renderJobs)
      .set({ status: 'done', finishedAt: new Date() })
      .where(eq(schema.renderJobs.configVersionId, versionId))

    await expect(requeueRenderJob(db, versionId)).rejects.toThrow()

    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('done')
  })
})

describe('runNetworkPreview', () => {
  it('promotes a held job to queued', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'held', networkHosts: ['wttr.in'] })
    await runNetworkPreview(db, versionId)
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
  })

  it('refuses when the job is not held', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'done', networkHosts: ['wttr.in'] })
    await expect(runNetworkPreview(db, versionId)).rejects.toThrow(/held/i)
  })
})

describe('requeueRenderJob held-job invariant', () => {
  it('refuses to re-queue a held job', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'held', networkHosts: ['wttr.in'] })
    await expect(requeueRenderJob(db, versionId)).rejects.toThrow()
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('held') // untouched
  })

  it('still re-queues a failed job', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'failed', networkHosts: [] })
    await requeueRenderJob(db, versionId)
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, versionId))
    expect(job?.status).toBe('queued')
  })
})

describe('setReadsClaudeToken', () => {
  it('setReadsClaudeToken flips the stored flag', async () => {
    const versionId = await seedVersionWithJob(db, { status: 'queued', networkHosts: [] })
    await setReadsClaudeToken(db, versionId, true, 'u1')
    const [ver] = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(ver?.readsClaudeToken).toBe(true)
    expect(ver?.reviewedBy).toBe('u1')
  })
})
