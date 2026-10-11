import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'

const MIGRATIONS = './drizzle'
const CREATE_SUBMISSIONS_TAG = '0035_submissions'

type Journal = { entries: { tag: string }[] }

/** A copy of the migrations folder whose journal stops at `lastTag`. */
function migrationsThrough(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'submissions-backfill-'))
  cpSync(MIGRATIONS, folder, { recursive: true })
  const journalPath = join(folder, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag)
  if (last < 0) throw new Error(`no migration tagged ${lastTag}`)
  writeFileSync(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, last + 1) }),
  )
  return folder
}

function backfillSql(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'),
  ) as Journal
  const created = journal.entries.findIndex((entry) => entry.tag === CREATE_SUBMISSIONS_TAG)
  const backfill = journal.entries[created + 1]
  if (!backfill) throw new Error('no migration after the submissions table')
  return readFileSync(join(MIGRATIONS, `${backfill.tag}.sql`), 'utf8')
}

const AUTHOR = 'author-1'
const OTHER_AUTHOR = 'author-2'
const CONFIG = '00000000-0000-4000-8000-0000000000c1'
const OTHER_CONFIG = '00000000-0000-4000-8000-0000000000c2'
const APPROVED = '00000000-0000-4000-8000-000000000001'
const REJECTED = '00000000-0000-4000-8000-000000000002'
const PENDING = '00000000-0000-4000-8000-000000000003'
const SUPERSEDED = '00000000-0000-4000-8000-000000000004'
const LATE = '00000000-0000-4000-8000-000000000005'

async function insertOldVersion(
  client: PGlite,
  id: string,
  configId: string,
  versionNumber: number,
  review: string,
) {
  await client.query(
    `INSERT INTO config_versions (
      id, config_id, version_number, title, source, interpreter, content_sha256, created_at,
      status, reviewed_by, reviewed_at, rejection_reason,
      rejection_email_status, rejection_email_id, rejection_email_error, rejection_email_sent_at,
      approval_email_status, approval_email_id, approval_email_error, approval_email_sent_at
    ) SELECT $1, $2, $3, 'Title', 'echo hi', 'bash', 'sha', created_at,
      status, reviewed_by, reviewed_at, rejection_reason,
      rejection_email_status, rejection_email_id, rejection_email_error, rejection_email_sent_at,
      approval_email_status, approval_email_id, approval_email_error, approval_email_sent_at
    FROM json_populate_record(NULL::config_versions, $4::json)`,
    [id, configId, versionNumber, review],
  )
}

describe('submissions backfill', () => {
  let client: PGlite
  let db: ReturnType<typeof drizzle<typeof schema>>
  let folder: string

  beforeAll(async () => {
    client = new PGlite()
    db = drizzle({ client, schema })
    folder = migrationsThrough(CREATE_SUBMISSIONS_TAG)
    await migrate(db, { migrationsFolder: folder })
    await client.exec(`
      INSERT INTO "user" (id, name, email) VALUES
        ('${AUTHOR}', 'Author One', 'one@test.com'),
        ('${OTHER_AUTHOR}', 'Author Two', 'two@test.com');
      INSERT INTO configs (id, slug, author_id, status) VALUES
        ('${CONFIG}', 'one', '${AUTHOR}', 'published'),
        ('${OTHER_CONFIG}', 'two', '${OTHER_AUTHOR}', 'draft');
    `)
    await insertOldVersion(
      client,
      APPROVED,
      CONFIG,
      1,
      JSON.stringify({
        created_at: '2026-09-01T10:00:00Z',
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: '2026-09-02T10:00:00Z',
        approval_email_status: 'sent',
        approval_email_id: 'email-approved',
        approval_email_sent_at: '2026-09-02T10:01:00Z',
      }),
    )
    await insertOldVersion(
      client,
      SUPERSEDED,
      CONFIG,
      2,
      JSON.stringify({ created_at: '2026-09-03T10:00:00Z', status: 'superseded' }),
    )
    await insertOldVersion(
      client,
      PENDING,
      CONFIG,
      3,
      JSON.stringify({ created_at: '2026-09-04T10:00:00Z', status: 'pending' }),
    )
    await insertOldVersion(
      client,
      REJECTED,
      OTHER_CONFIG,
      1,
      JSON.stringify({
        created_at: '2026-09-05T10:00:00Z',
        status: 'rejected',
        reviewed_by: 'admin-2',
        reviewed_at: '2026-09-06T10:00:00Z',
        rejection_reason: 'Reads a token it does not need',
        rejection_email_status: 'failed',
        rejection_email_id: 'email-rejected',
        rejection_email_error: 'Email delivery failed',
        rejection_email_sent_at: '2026-09-06T10:01:00Z',
        approval_email_error: 'left over',
      }),
    )
    await migrate(db, { migrationsFolder: MIGRATIONS })
  })
  afterAll(async () => {
    await client.close()
    rmSync(folder, { recursive: true, force: true })
  })

  it('copies every status line version’s review state into its submission', async () => {
    const rows = await db
      .select()
      .from(schema.submissions)
      .orderBy(asc(schema.submissions.createdAt))
    expect(rows).toEqual([
      {
        id: APPROVED,
        kind: 'status_line',
        configVersionId: APPROVED,
        modVersionId: null,
        submittedBy: AUTHOR,
        status: 'approved',
        reviewedBy: 'admin-1',
        reviewedAt: new Date('2026-09-02T10:00:00Z'),
        rejectionReason: null,
        rejectionEmailStatus: null,
        rejectionEmailId: null,
        rejectionEmailError: null,
        rejectionEmailSentAt: null,
        approvalEmailStatus: 'sent',
        approvalEmailId: 'email-approved',
        approvalEmailError: null,
        approvalEmailSentAt: new Date('2026-09-02T10:01:00Z'),
        createdAt: new Date('2026-09-01T10:00:00Z'),
      },
      expect.objectContaining({
        id: SUPERSEDED,
        submittedBy: AUTHOR,
        status: 'superseded',
        reviewedAt: null,
        createdAt: new Date('2026-09-03T10:00:00Z'),
      }),
      expect.objectContaining({
        id: PENDING,
        submittedBy: AUTHOR,
        status: 'pending',
        createdAt: new Date('2026-09-04T10:00:00Z'),
      }),
      {
        id: REJECTED,
        kind: 'status_line',
        configVersionId: REJECTED,
        modVersionId: null,
        submittedBy: OTHER_AUTHOR,
        status: 'rejected',
        reviewedBy: 'admin-2',
        reviewedAt: new Date('2026-09-06T10:00:00Z'),
        rejectionReason: 'Reads a token it does not need',
        rejectionEmailStatus: 'failed',
        rejectionEmailId: 'email-rejected',
        rejectionEmailError: 'Email delivery failed',
        rejectionEmailSentAt: new Date('2026-09-06T10:01:00Z'),
        approvalEmailStatus: null,
        approvalEmailId: null,
        approvalEmailError: 'left over',
        approvalEmailSentAt: null,
        createdAt: new Date('2026-09-05T10:00:00Z'),
      },
    ])
  })

  it('can run again to copy versions written after it, leaving copied rows alone', async () => {
    await insertOldVersion(
      client,
      LATE,
      OTHER_CONFIG,
      2,
      JSON.stringify({ created_at: '2026-09-07T10:00:00Z', status: 'pending' }),
    )
    await client.exec(backfillSql())
    const rows = await db
      .select()
      .from(schema.submissions)
      .orderBy(asc(schema.submissions.createdAt))
    expect(rows.map((row) => [row.id, row.status])).toEqual([
      [APPROVED, 'approved'],
      [SUPERSEDED, 'superseded'],
      [PENDING, 'pending'],
      [REJECTED, 'rejected'],
      [LATE, 'pending'],
    ])
  })
})

describe('submissions constraints', () => {
  let client: PGlite
  let db: ReturnType<typeof drizzle<typeof schema>>
  let versionId: string

  beforeAll(async () => {
    client = new PGlite()
    db = drizzle({ client, schema })
    await migrate(db, { migrationsFolder: MIGRATIONS })
    await db.insert(schema.user).values({ id: AUTHOR, name: 'Author', email: 'a@test.com' })
    const [config] = await db
      .insert(schema.configs)
      .values({ slug: 'one', authorId: AUTHOR })
      .returning()
    const [version] = await db
      .insert(schema.configVersions)
      .values({
        configId: config?.id as string,
        versionNumber: 1,
        title: 'Title',
        source: 'echo hi',
        interpreter: 'bash',
        contentSha256: 'sha',
      })
      .returning()
    versionId = version?.id as string
  })
  afterAll(async () => {
    await client.close()
  })

  it.each([
    [
      'an id other than its version’s',
      () => ({ id: PENDING, configVersionId: versionId }),
      'submissions_id_is_version_id',
    ],
    [
      'a mod kind pointing at a status line version',
      () => ({ id: versionId, kind: 'mod' as const, configVersionId: versionId }),
      'submissions_kind_version_check',
    ],
    ['no version at all', () => ({ id: versionId }), 'submissions_kind_version_check'],
  ])('rejects %s', async (_name, row, constraint) => {
    await expect(
      db.insert(schema.submissions).values({ kind: 'status_line', submittedBy: AUTHOR, ...row() }),
    ).rejects.toMatchObject({ cause: { constraint } })
  })
})
