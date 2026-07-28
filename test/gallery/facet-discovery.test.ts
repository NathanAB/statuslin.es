import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'

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
let getFacetPage: typeof import('@/gallery/functions').getFacetPage
let llmsTxtResponseForRoute: typeof import('@/gallery/functions').llmsTxtResponseForRoute
let sitemapResponseForRoute: typeof import('@/gallery/functions').sitemapResponseForRoute
let FacetRoute: typeof import('@/routes/status-lines.$facet').Route

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'https://statuslin.es'
  client = new PGlite()
  db = drizzle({ client, schema })
  testState.db = db
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'facet-discovery-author',
    name: 'Facet Discovery Author',
    email: 'facet-discovery@test.com',
    emailVerified: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  })

  await seedPublished('python-one', ['python'])
  await seedPublished('cost-one', ['cost'])
  await seedPublished('cost-two', ['cost'])
  await seedPublished('git-one', ['git'])
  await seedPublished('git-two', ['git'])
  await seedPublished('git-three', ['git'])

  const functions = await import('@/gallery/functions')
  getFacetPage = functions.getFacetPage
  llmsTxtResponseForRoute = functions.llmsTxtResponseForRoute
  sitemapResponseForRoute = functions.sitemapResponseForRoute
  FacetRoute = (await import('@/routes/status-lines.$facet')).Route
})

afterAll(async () => {
  await client.close()
})

async function seedPublished(slug: string, allTags: string[]) {
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: slug,
      description: `${slug} description`,
      authorId: 'facet-discovery-author',
      interpreter: 'bash',
      allTags,
      status: 'published',
      createdAt: new Date('2026-06-01T00:00:00Z'),
    })
    .returning()
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config!.id,
      versionNumber: 1,
      source: `echo ${slug}`,
      interpreter: 'bash',
      contentSha256: slug.padEnd(64, '0'),
      status: 'approved',
    })
    .returning()
  await db
    .update(schema.configs)
    .set({ currentVersionId: version!.id })
    .where(eq(schema.configs.id, config!.id))
}

async function headFor(facet: string) {
  const page = await getFacetPage({ data: { facet } } as never)
  const head = await FacetRoute.options.head?.({
    loaderData: page ? { page, user: null } : undefined,
  } as never)
  return { page, head }
}

describe('facet discovery threshold', () => {
  it('keeps facets with 1 or 2 configs accessible while only 3 is indexable', async () => {
    const one = await getFacetPage({ data: { facet: 'python' } } as never)
    const two = await getFacetPage({ data: { facet: 'cost' } } as never)
    const three = await getFacetPage({ data: { facet: 'git' } } as never)

    expect(one).toMatchObject({ slug: 'python', indexable: false })
    expect(two).toMatchObject({ slug: 'cost', indexable: false })
    expect(three).toMatchObject({ slug: 'git', indexable: true })
  })

  it.each([
    'python',
    'cost',
  ])('makes the thin %s facet self-canonical and noindex without CollectionPage JSON-LD', async (facet) => {
    const { head } = await headFor(facet)

    expect(head?.links).toContainEqual({
      rel: 'canonical',
      href: `https://statuslin.es/status-lines/${facet}`,
    })
    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
    const types = (head?.scripts ?? []).map(
      (script) => JSON.parse(String(script?.children))['@type'] as string,
    )
    expect(types).toEqual(['BreadcrumbList'])
  })

  it('keeps the 3-config facet indexable with collection and breadcrumb JSON-LD', async () => {
    const { head } = await headFor('git')

    expect(head?.meta).not.toContainEqual({ name: 'robots', content: 'noindex, follow' })
    const types = (head?.scripts ?? []).map(
      (script) => JSON.parse(String(script?.children))['@type'] as string,
    )
    expect(types).toEqual(['CollectionPage', 'BreadcrumbList'])
  })

  it('omits 1- and 2-config facets from sitemap and llms.txt discovery', async () => {
    const sitemap = await (await sitemapResponseForRoute()).text()
    const llms = await (await llmsTxtResponseForRoute()).text()

    for (const facet of ['python', 'cost']) {
      expect(sitemap).not.toContain(`/status-lines/${facet}`)
      expect(llms).not.toContain(`/status-lines/${facet}`)
    }
    expect(sitemap).toContain('/status-lines/git')
    expect(llms).toContain('/status-lines/git')
  })

  it('returns only indexable alternatives for More ways to browse', async () => {
    const page = await getFacetPage({ data: { facet: 'python' } } as never)
    const slugs = page?.otherFacets.map((facet) => facet.slug)

    expect(slugs).toContain('git')
    expect(slugs).not.toContain('cost')
  })
})
