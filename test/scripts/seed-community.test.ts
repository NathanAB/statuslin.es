import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  account as accountTable,
  configs as configsTable,
  configVersions as configVersionsTable,
  renderJobs as renderJobsTable,
  user as userTable,
} from '@/db/schema'
import {
  type CommunityConfig,
  ensureSeededAuthor,
  fetchGithubUser,
  publishRenderedSeeds,
  releaseHeldSeeds,
  seedCommunity,
  seedCommunityConfig,
} from '../../scripts/seed-community'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})

afterAll(async () => {
  await client.close()
})

const octo = {
  id: '583231',
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
}

describe('fetchGithubUser', () => {
  it('maps the GitHub API response to id/login/name/avatarUrl', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: 583231,
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch

    const user = await fetchGithubUser('octocat')
    expect(user).toEqual({
      id: '583231',
      login: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
    })
  })

  it('falls back to login when GitHub name is null', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ id: 1, login: 'ghost', name: null, avatar_url: 'https://x/y.png' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch

    const user = await fetchGithubUser('ghost')
    expect(user.name).toBe('ghost')
  })

  it('throws a clear error on 404', async () => {
    globalThis.fetch = (async () =>
      new Response('Not Found', { status: 404 })) as unknown as typeof fetch
    await expect(fetchGithubUser('nope')).rejects.toThrow('GitHub user not found: nope')
  })

  it('throws on a non-404 error (e.g. rate limit)', async () => {
    globalThis.fetch = (async () =>
      new Response('rate limited', { status: 403 })) as unknown as typeof fetch
    await expect(fetchGithubUser('busy')).rejects.toThrow('GitHub API error 403 for busy')
  })
})

describe('ensureSeededAuthor', () => {
  it('creates a user + github account row and returns the user id', async () => {
    const userId = await ensureSeededAuthor(db, octo)
    expect(userId).toBeTruthy()

    const [u] = await db.select().from(userTable).where(eq(userTable.id, userId))
    expect(u?.username).toBe('octocat')
    expect(u?.image).toBe(octo.avatarUrl)
    expect(u?.email).toBe('seed+octocat@statuslin.es')

    const [acc] = await db
      .select()
      .from(accountTable)
      .where(and(eq(accountTable.providerId, 'github'), eq(accountTable.accountId, '583231')))
    expect(acc?.userId).toBe(userId)
  })

  it('is idempotent: a second call returns the same user id and makes no duplicate', async () => {
    const first = await ensureSeededAuthor(db, octo)
    const second = await ensureSeededAuthor(db, octo)
    expect(second).toBe(first)

    const accs = await db.select().from(accountTable).where(eq(accountTable.accountId, '583231'))
    expect(accs.length).toBe(1)
  })

  it('reuses an existing real account (someone who already signed in)', async () => {
    const now = new Date()
    await db.insert(userTable).values({
      id: 'real-user',
      name: 'Real Mona',
      email: 'mona@real.example',
      emailVerified: true,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(accountTable).values({
      id: 'real-acc',
      accountId: '777',
      providerId: 'github',
      userId: 'real-user',
      createdAt: now,
      updatedAt: now,
    })

    const returned = await ensureSeededAuthor(db, {
      id: '777',
      login: 'mona',
      name: 'Mona',
      avatarUrl: 'https://x/mona.png',
    })
    expect(returned).toBe('real-user')
  })
})

describe('seedCommunityConfig', () => {
  const entry: CommunityConfig = {
    githubLogin: 'seedocto',
    githubId: '4242',
    title: 'Octo Minimal',
    description: 'Model and branch only.',
    interpreter: 'bash',
    source: '#!/usr/bin/env bash\necho "hi"',
    license: 'MIT',
    sourceUrl: 'https://github.com/seedocto/dotfiles',
  }

  it('submits a draft + queued render job attributed to the seeded author (no publish)', async () => {
    const profile = {
      id: '4242',
      login: 'seedocto',
      name: 'The Octocat',
      avatarUrl: 'https://x/o.png',
    }
    const authorId = await ensureSeededAuthor(db, profile)

    const outcome = await seedCommunityConfig(db, profile, entry)
    expect(outcome.status).toBe('submitted')
    expect(outcome.slug).toBeTruthy()

    const [cfg] = await db
      .select()
      .from(configsTable)
      .where(eq(configsTable.id, outcome.configId as string))
    // Submit-only: the config is a draft awaiting the worker + admin review, never auto-published.
    expect(cfg?.status).toBe('draft')
    expect(cfg?.authorId).toBe(authorId)

    // A render job was queued for THIS config (scoped to its version) for the worker to pick up.
    const [ver] = await db
      .select()
      .from(configVersionsTable)
      .where(eq(configVersionsTable.configId, outcome.configId as string))
    const [job] = await db
      .select()
      .from(renderJobsTable)
      .where(eq(renderJobsTable.configVersionId, ver?.id as string))
    expect(job?.status).toBe('queued')
  })

  it('is idempotent: a second run for the same author + title skips', async () => {
    const profile = {
      id: '4243',
      login: 'hubot',
      name: 'Hubot',
      avatarUrl: 'https://x/h.png',
    }
    await ensureSeededAuthor(db, profile)
    const e: CommunityConfig = { ...entry, githubLogin: 'hubot', githubId: '4243' }

    const first = await seedCommunityConfig(db, profile, e)
    expect(first.status).toBe('submitted')
    const second = await seedCommunityConfig(db, profile, e)
    expect(second.status).toBe('skipped')
  })

  it('forwards networkHosts/license/sourceUrl through to the created version, held for network', async () => {
    const profile = {
      id: '4244',
      login: 'networked',
      name: 'Networked',
      avatarUrl: 'https://x/n.png',
    }
    await ensureSeededAuthor(db, profile)
    const e: CommunityConfig = {
      ...entry,
      githubLogin: 'networked',
      githubId: '4244',
      title: 'Networked Config',
      networkHosts: ['api.anthropic.com'],
    }

    const outcome = await seedCommunityConfig(db, profile, e)
    expect(outcome.status).toBe('submitted')

    const [ver] = await db
      .select()
      .from(configVersionsTable)
      .where(eq(configVersionsTable.configId, outcome.configId as string))
    expect(ver?.networkHosts).toEqual(['api.anthropic.com'])
    expect(ver?.license).toBe('MIT')
    expect(ver?.sourceUrl).toBe('https://github.com/seedocto/dotfiles')
    expect(ver?.readsClaudeToken).toBe(false)

    const [job] = await db
      .select()
      .from(renderJobsTable)
      .where(eq(renderJobsTable.configVersionId, ver?.id as string))
    expect(job?.status).toBe('held')
  })

  it('a no-network entry gets a queued (not held) render job', async () => {
    const profile = {
      id: '4245',
      login: 'nonetwork',
      name: 'No Network',
      avatarUrl: 'https://x/nn.png',
    }
    await ensureSeededAuthor(db, profile)
    const e: CommunityConfig = {
      ...entry,
      githubLogin: 'nonetwork',
      githubId: '4245',
      title: 'No Network Config',
    }

    const outcome = await seedCommunityConfig(db, profile, e)

    const [ver] = await db
      .select()
      .from(configVersionsTable)
      .where(eq(configVersionsTable.configId, outcome.configId as string))
    const [job] = await db
      .select()
      .from(renderJobsTable)
      .where(eq(renderJobsTable.configVersionId, ver?.id as string))
    expect(job?.status).toBe('queued')
  })
})

describe('seedCommunity', () => {
  function stubUsers(byLogin: Record<string, { id: string; avatar_url: string }>) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const login = url.split('/').pop() ?? ''
      const u = byLogin[login]
      if (!u) return new Response('Not Found', { status: 404 })
      return new Response(
        JSON.stringify({ id: u.id, login, name: login, avatar_url: u.avatar_url }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch
  }

  it('records an error for a failed entry and still processes the rest', async () => {
    stubUsers({ good1: { id: '5001', avatar_url: 'https://x/g.png' } })
    const entries: CommunityConfig[] = [
      {
        githubLogin: 'missing1', // 404 → error
        githubId: '9999',
        title: 'Missing One',
        description: 'd',
        interpreter: 'bash',
        source: '#!/usr/bin/env bash\necho ok',
        license: 'MIT',
        sourceUrl: 'https://example.com/missing1',
      },
      {
        githubLogin: 'good1',
        githubId: '5001',
        title: 'Good One',
        description: 'd',
        interpreter: 'bash',
        source: '#!/usr/bin/env bash\necho ok',
        license: 'MIT',
        sourceUrl: 'https://example.com/good1',
      },
    ]

    const outcomes = await seedCommunity(db, entries)
    expect(outcomes[0]?.status).toBe('error')
    expect(outcomes[1]?.status).toBe('submitted')
  })

  it('errors (does not seed) when the live GitHub id no longer matches the pinned id', async () => {
    // login resolves to a different id than pinned — recycled/renamed login.
    stubUsers({ recycled: { id: '6002', avatar_url: 'https://x/r.png' } })
    const entries: CommunityConfig[] = [
      {
        githubLogin: 'recycled',
        githubId: '6001', // pinned at review time; live API now returns 6002
        title: 'Recycled Login',
        description: 'd',
        interpreter: 'bash',
        source: '#!/usr/bin/env bash\necho ok',
        license: 'MIT',
        sourceUrl: 'https://example.com/recycled',
      },
    ]

    const outcomes = await seedCommunity(db, entries)
    expect(outcomes[0]?.status).toBe('error')
    expect(outcomes[0]?.reason).toMatch(/mismatch/i)

    // Nothing was seeded for the wrong id.
    const accs = await db
      .select()
      .from(accountTable)
      .where(and(eq(accountTable.providerId, 'github'), eq(accountTable.accountId, '6002')))
    expect(accs.length).toBe(0)
  })
})

describe('releaseHeldSeeds', () => {
  // Isolate from held/pending render jobs left behind by earlier describe blocks in this file
  // (cascades to configVersions + renderJobs) so the count assertion below is exact.
  beforeEach(async () => {
    await db.delete(configsTable)
  })

  it('flips every held render job to queued and returns the count', async () => {
    const profile = {
      id: '7001',
      login: 'heldauthor',
      name: 'Held Author',
      avatarUrl: 'https://x/held.png',
    }
    await ensureSeededAuthor(db, profile)
    const heldEntry: CommunityConfig = {
      githubLogin: 'heldauthor',
      githubId: '7001',
      title: 'Held Config One',
      description: 'd',
      interpreter: 'bash',
      source: '#!/usr/bin/env bash\necho ok',
      license: 'MIT',
      sourceUrl: 'https://example.com/held-one',
      networkHosts: ['api.anthropic.com'],
    }
    const heldEntry2: CommunityConfig = {
      ...heldEntry,
      title: 'Held Config Two',
      networkHosts: ['api.anthropic.com'],
    }
    const outcome1 = await seedCommunityConfig(db, profile, heldEntry)
    const outcome2 = await seedCommunityConfig(db, profile, heldEntry2)

    // A held job from a NON-seed author (a real web submission using the network-preview gate)
    // must be left alone — releaseHeldSeeds only releases seed-authored (email seed+*) jobs.
    const now = new Date()
    await db.insert(userTable).values({
      id: 'real-web-user',
      name: 'Real Web User',
      email: 'realuser@example.com',
      emailVerified: true,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    })
    const [realConfig] = await db
      .insert(configsTable)
      .values({
        slug: 'real-user-held-config',
        title: 'Real User Held Config',
        description: 'd',
        authorId: 'real-web-user',
        interpreter: 'bash',
        status: 'draft',
      })
      .returning()
    const [realVersion] = await db
      .insert(configVersionsTable)
      .values({
        configId: realConfig?.id as string,
        versionNumber: 1,
        source: '#!/usr/bin/env bash\necho ok',
        interpreter: 'bash',
        contentSha256: 'deadbeef',
        networkHosts: ['api.anthropic.com'],
        status: 'pending',
      })
      .returning()
    await db.insert(renderJobsTable).values({
      configVersionId: realVersion?.id as string,
      status: 'held',
    })

    const count = await releaseHeldSeeds(db)
    expect(count).toBe(2)

    for (const configId of [outcome1.configId, outcome2.configId]) {
      const [ver] = await db
        .select()
        .from(configVersionsTable)
        .where(eq(configVersionsTable.configId, configId as string))
      const [job] = await db
        .select()
        .from(renderJobsTable)
        .where(eq(renderJobsTable.configVersionId, ver?.id as string))
      expect(job?.status).toBe('queued')
    }

    const [realJob] = await db
      .select()
      .from(renderJobsTable)
      .where(eq(renderJobsTable.configVersionId, realVersion?.id as string))
    expect(realJob?.status).toBe('held')
  })
})

describe('publishRenderedSeeds', () => {
  // Isolate from pending versions left behind by earlier describe blocks in this file so the
  // published/skipped counts below are exact.
  beforeEach(async () => {
    await db.delete(configsTable)
  })

  it('publishes every pending version whose render job is done, and counts the rest as skipped', async () => {
    const profile = {
      id: '8001',
      login: 'publishauthor',
      name: 'Publish Author',
      avatarUrl: 'https://x/pub.png',
    }
    await ensureSeededAuthor(db, profile)

    const doneEntry: CommunityConfig = {
      githubLogin: 'publishauthor',
      githubId: '8001',
      title: 'Done Config',
      description: 'd',
      interpreter: 'bash',
      source: '#!/usr/bin/env bash\necho ok',
      license: 'MIT',
      sourceUrl: 'https://example.com/done',
    }
    const notDoneEntry: CommunityConfig = { ...doneEntry, title: 'Not Done Config' }

    const doneOutcome = await seedCommunityConfig(db, profile, doneEntry)
    const notDoneOutcome = await seedCommunityConfig(db, profile, notDoneEntry)

    const [doneVer] = await db
      .select()
      .from(configVersionsTable)
      .where(eq(configVersionsTable.configId, doneOutcome.configId as string))
    await db
      .update(renderJobsTable)
      .set({ status: 'done', finishedAt: new Date() })
      .where(eq(renderJobsTable.configVersionId, doneVer?.id as string))

    const result = await publishRenderedSeeds(db)
    expect(result).toEqual({ published: 1, skipped: 1 })

    const [doneCfg] = await db
      .select()
      .from(configsTable)
      .where(eq(configsTable.id, doneOutcome.configId as string))
    expect(doneCfg?.status).toBe('published')

    const [notDoneCfg] = await db
      .select()
      .from(configsTable)
      .where(eq(configsTable.id, notDoneOutcome.configId as string))
    expect(notDoneCfg?.status).toBe('draft')
  })
})
