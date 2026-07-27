import '@/lib/refuse-in-production'
import { setTimeout as sleep } from 'node:timers/promises'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { user } from '@/db/auth-schema'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { processNextRenderJob } from '@/submit/worker'
import {
  assertAllowedE2ETarget,
  assertDisposableUserCleanup,
  assertLinkedHistory,
  assertPublishedAfterApprovalDelivery,
  browserConsoleErrors,
  browserCookieCommand,
  commandFailureMessage,
  describeBrowserCommand,
  isTerminalDecisionEmailStatus,
  parseSessionCookie,
  renderStrategy,
  runDisposableUserCleanup,
  type VersionHistoryRow,
} from './rejection-resubmission-helpers'

const BASE = process.env.BETTER_AUTH_URL ?? 'http://localhost:3100'
assertAllowedE2ETarget(BASE)
const RENDER_STRATEGY = renderStrategy(BASE)
const AUTHOR_ID = 'e2e-rejection-author'
const ADMIN_ID = 'e2e-rejection-admin'
const AUTHOR_EMAIL = 'e2e-rejection-author@test.invalid'
const ADMIN_EMAIL = 'e2e-rejection-admin@test.invalid'
const AUTHOR_SESSION = 'statuslines-e2e-rejection-author'
const ADMIN_SESSION = 'statuslines-e2e-rejection-admin'
const marker = `E2E rejection ${Date.now()}`
const originalSource = '#!/bin/bash\necho original-e2e'
const correctedSource = 'console.log("corrected-e2e")'
const reason = `Remove the updater. ${marker}`

async function run(
  command: string[],
  sensitive = false,
  label: string = command[0] ?? 'command',
): Promise<string> {
  const proc = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(commandFailureMessage(label, stderr || stdout, !sensitive))
  }
  return stdout
}

async function browser(session: string, ...args: string[]): Promise<string> {
  return run(
    ['agent-browser', '--session', session, ...args],
    true,
    describeBrowserCommand(session, args),
  )
}

async function mintCookie(email: string): Promise<string> {
  return parseSessionCookie(await run(['bun', 'run', 'dev:login', email], true))
}

async function waitFor<T>(
  label: string,
  query: () => Promise<T | undefined>,
  attempts = 50,
  intervalMs = 200,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await query()
    if (result !== undefined) return result
    await sleep(intervalMs)
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function clickButtonInCard(session: string, title: string, label: string) {
  const script = `(() => {
    const cards = [...document.querySelectorAll('[data-slot="card"]')]
    const card = cards.find((node) => node.textContent?.includes(${JSON.stringify(title)}))
    const button = card && [...card.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === ${JSON.stringify(label)})
    if (!button) throw new Error(JSON.stringify({
      cardCount: cards.length,
      cardFound: !!card,
      buttons: card ? [...card.querySelectorAll('button')].map((node) => node.textContent?.trim()) : []
    }))
    button.click()
    return true
  })()`
  await browser(session, 'eval', script)
  await browser(session, 'wait', '300')
}

async function openReady(session: string, path: string, readySelector: string) {
  await browser(session, 'console', '--clear')
  await browser(session, 'errors', '--clear')
  await browser(session, 'open', `${BASE}${path}`)
  await browser(session, 'wait', '--load', 'networkidle')
  await browser(session, 'wait', readySelector)
  const failures = [
    ...browserConsoleErrors(await browser(session, 'console')),
    ...browserConsoleErrors(await browser(session, 'errors')),
  ]
  if (failures.length > 0) throw new Error(`${path} browser errors: ${failures.join(' | ')}`)
}

async function renderVersion(versionId: string) {
  if (RENDER_STRATEGY === 'external') {
    await waitFor(
      `render job ${versionId}`,
      async () => {
        const [job] = await db
          .select({ status: renderJobs.status })
          .from(renderJobs)
          .where(eq(renderJobs.configVersionId, versionId))
        if (job?.status === 'failed') {
          throw new Error(`render job ${versionId} failed`)
        }
        return job?.status === 'done' ? job : undefined
      },
      120,
      1000,
    )
    return
  }
  const processed = await processNextRenderJob(
    db,
    new FakeSandboxRunner({ 'clean-main': { stdout: 'e2e-preview' } }),
  )
  if (!processed) throw new Error('expected a queued render job')
}

async function versionRows(configId: string): Promise<VersionHistoryRow[]> {
  return db
    .select({
      configId: configs.id,
      slug: configs.slug,
      versionNumber: configVersions.versionNumber,
      status: configVersions.status,
      source: configVersions.source,
    })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .where(eq(configVersions.configId, configId))
    .orderBy(asc(configVersions.versionNumber))
}

async function prepareUsers() {
  await db.delete(user).where(inArray(user.id, [AUTHOR_ID, ADMIN_ID]))
  await db.insert(user).values([
    {
      id: AUTHOR_ID,
      name: 'E2E Rejection Author',
      email: AUTHOR_EMAIL,
      emailVerified: true,
      role: 'user',
      username: 'e2e-rejection-author',
    },
    {
      id: ADMIN_ID,
      name: 'E2E Rejection Admin',
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: 'admin',
      username: 'e2e-rejection-admin',
    },
  ])
}

async function main() {
  if (!(await fetch(BASE)).ok) throw new Error(`dev server is not reachable at ${BASE}`)
  await prepareUsers()
  const [authorCookie, adminCookie] = await Promise.all([
    mintCookie(AUTHOR_EMAIL),
    mintCookie(ADMIN_EMAIL),
  ])
  await browser(AUTHOR_SESSION, ...browserCookieCommand(BASE, authorCookie))
  await browser(ADMIN_SESSION, ...browserCookieCommand(BASE, adminCookie))

  await openReady(AUTHOR_SESSION, '/submit', '#title')
  await browser(AUTHOR_SESSION, 'fill', '#title', marker)
  await browser(AUTHOR_SESSION, 'fill', '#description', 'Original E2E description')
  await browser(AUTHOR_SESSION, 'fill', '#source', originalSource)
  await browser(AUTHOR_SESSION, 'eval', "document.querySelector('form')?.requestSubmit()")
  const submitted = await waitFor('submitted config', async () => {
    const [row] = await db.select().from(configs).where(eq(configs.title, marker))
    return row
  })

  const [v1] = await db
    .select()
    .from(configVersions)
    .where(eq(configVersions.configId, submitted.id))
  if (!v1) throw new Error('submitted version not found')
  await renderVersion(v1.id)

  await openReady(ADMIN_SESSION, '/admin', 'main')
  await clickButtonInCard(ADMIN_SESSION, marker, 'Reject')
  await browser(ADMIN_SESSION, 'fill', `#rejection-reason-${v1.id}`, reason)
  await clickButtonInCard(ADMIN_SESSION, marker, 'Reject and email author')
  await waitFor('terminal rejection email delivery', async () => {
    const [row] = await db
      .select({ emailStatus: configVersions.rejectionEmailStatus })
      .from(configVersions)
      .where(eq(configVersions.id, v1.id))
    return isTerminalDecisionEmailStatus(row?.emailStatus) ? row : undefined
  })

  await openReady(AUTHOR_SESSION, '/me', 'main')
  const meSnapshot = await browser(AUTHOR_SESSION, 'snapshot')
  if (!meSnapshot.includes(reason) || !meSnapshot.includes('Fix and resubmit')) {
    throw new Error('author rejection reason or resubmission link is missing')
  }
  await browser(
    AUTHOR_SESSION,
    'eval',
    'document.querySelector(\'a[href^="/submit?resubmit="]\')?.click()',
  )
  await browser(AUTHOR_SESSION, 'wait', '#source')
  if ((await browser(AUTHOR_SESSION, 'get', 'value', '#source')).trim() !== originalSource) {
    throw new Error('resubmission source was not prefilled')
  }
  await browser(AUTHOR_SESSION, 'fill', '#title', `${marker} corrected`)
  await browser(AUTHOR_SESSION, 'fill', '#description', 'Corrected E2E description')
  await browser(AUTHOR_SESSION, 'select', '#interpreter', 'node')
  await browser(AUTHOR_SESSION, 'fill', '#source', correctedSource)
  await browser(AUTHOR_SESSION, 'eval', "document.querySelector('#network')?.click()")
  await browser(AUTHOR_SESSION, 'fill', '#network-host-draft', 'example.com')
  await browser(
    AUTHOR_SESSION,
    'eval',
    "[...document.querySelectorAll('button')].find((node)=>node.textContent?.trim()==='Add host')?.click()",
  )
  await browser(AUTHOR_SESSION, 'eval', "document.querySelector('form')?.requestSubmit()")

  const history = await waitFor('linked v2', async () => {
    const rows = await versionRows(submitted.id)
    return rows.length === 2 ? rows : undefined
  })
  assertLinkedHistory(history, {
    slug: submitted.slug,
    originalSource,
    correctedSource,
  })
  const v2 = history[1]
  if (!v2) throw new Error('corrected version not found')
  const [v2Record] = await db
    .select()
    .from(configVersions)
    .where(and(eq(configVersions.configId, submitted.id), eq(configVersions.versionNumber, 2)))
  if (!v2Record) throw new Error('corrected version record not found')
  const [v2Job] = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.configVersionId, v2Record.id))
  if (v2Job?.status !== 'held') throw new Error('network resubmission was not held for review')

  await openReady(ADMIN_SESSION, '/admin', 'main')
  await clickButtonInCard(ADMIN_SESSION, `${marker} corrected`, 'Run network preview')
  await renderVersion(v2Record.id)
  await browser(ADMIN_SESSION, 'reload')
  await browser(ADMIN_SESSION, 'wait', '500')
  await clickButtonInCard(ADMIN_SESSION, `${marker} corrected`, 'Approve')
  const approvalOutcome = await waitFor('published v2 with terminal approval email', async () => {
    const [row] = await db
      .select({
        configStatus: configs.status,
        currentVersionId: configs.currentVersionId,
        versionStatus: configVersions.status,
        approvalEmailStatus: configVersions.approvalEmailStatus,
      })
      .from(configVersions)
      .innerJoin(configs, eq(configs.id, configVersions.configId))
      .where(and(eq(configs.id, submitted.id), eq(configVersions.id, v2Record.id)))
    return isTerminalDecisionEmailStatus(row?.approvalEmailStatus) ? row : undefined
  })
  assertPublishedAfterApprovalDelivery(approvalOutcome, v2Record.id)

  await openReady(AUTHOR_SESSION, `/c/${submitted.slug}`, 'main')
  const detail = await browser(AUTHOR_SESSION, 'snapshot')
  if (!detail.includes(`${marker} corrected`))
    throw new Error('published corrected title is missing')
  console.log(`E2E PASSED: ${submitted.slug}`)
}

let mainFailure: unknown
try {
  await main()
} catch (error) {
  mainFailure = error
}
const browserCleanup = Promise.allSettled([
  browser(AUTHOR_SESSION, 'close'),
  browser(ADMIN_SESSION, 'close'),
])
const databaseCleanup = await runDisposableUserCleanup(() =>
  db.delete(user).where(inArray(user.id, [AUTHOR_ID, ADMIN_ID])),
)
await browserCleanup
try {
  assertDisposableUserCleanup(databaseCleanup)
} catch (cleanupError) {
  if (mainFailure === undefined) mainFailure = cleanupError
  else console.error('failed to remove disposable E2E users after an earlier failure')
}
if (mainFailure !== undefined) throw mainFailure
process.exit(0)
