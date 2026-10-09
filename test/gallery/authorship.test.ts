import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'

const getSession = vi.hoisted(() => vi.fn())
const database = vi.hoisted(() => ({ current: undefined as unknown }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: (data: never) => unknown) => ({
      handler: (handler: (args: { data: unknown }) => unknown) => (args: { data: never }) =>
        handler({ data: validator(args.data) }),
    }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/db', () => ({
  get db() {
    return database.current
  },
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }))
vi.mock('@/lib/http.server', () => ({ withHttpStatus: (run: () => unknown) => run() }))

const { getViewerIsAuthor } = await import('@/gallery/authorship')

let client: PGlite

async function seedUser(id: string) {
  const db = database.current as ReturnType<typeof drizzle<typeof schema>>
  await db.insert(schema.user).values({
    id,
    name: id,
    username: id,
    email: `${id}@test.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function seedConfig(slug: string, status: string) {
  const db = database.current as ReturnType<typeof drizzle<typeof schema>>
  await db.insert(schema.configs).values({ slug, authorId: 'owner', status })
}

beforeAll(async () => {
  client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  database.current = db
  await seedUser('owner')
  await seedUser('someone-else')
  await seedConfig('owned-line', 'published')
  await seedConfig('owned-removed', 'removed')
})
afterAll(async () => {
  await client.close()
})
beforeEach(() => {
  getSession.mockReset()
})

const isAuthor = (slug: string) => getViewerIsAuthor({ data: { slug } })

describe('getViewerIsAuthor', () => {
  it('is true for the signed-in author of a published config', async () => {
    getSession.mockResolvedValue({ user: { id: 'owner' } })
    await expect(isAuthor('owned-line')).resolves.toBe(true)
  })

  it('is false for a signed-in user who did not write the config', async () => {
    getSession.mockResolvedValue({ user: { id: 'someone-else' } })
    await expect(isAuthor('owned-line')).resolves.toBe(false)
  })

  it('is false when signed out', async () => {
    getSession.mockResolvedValue(null)
    await expect(isAuthor('owned-line')).resolves.toBe(false)
  })

  it('is false for the author of a config that is no longer published', async () => {
    getSession.mockResolvedValue({ user: { id: 'owner' } })
    await expect(isAuthor('owned-removed')).resolves.toBe(false)
  })
})
