import { afterEach, describe, expect, it } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { MODS_FAQ } from '@/mods/mods-page-faq'
import { Route as ModsRoute } from '@/routes/mods.index'

const ORIGIN = 'https://statuslin.es'
const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
})

function mod(slug: string, title: string): GalleryModCard {
  return {
    modId: `id-${slug}`,
    slug,
    title,
    description: `${title} does a thing.`,
    authorGithub: 'octocat',
    copyCount: 1,
    tags: [],
    preview: [{ text: `${slug} preview` }],
    desktopShot: null,
  }
}

const MODS = [mod('meter', 'Meter'), mod('file-tree', 'File Tree')]

interface Head {
  meta: Array<Record<string, string>>
  links: Array<{ rel: string; href: string }>
  scripts: Array<{ type: string; children: string }>
}

async function head(mods: GalleryModCard[]): Promise<Head> {
  process.env.BETTER_AUTH_URL = ORIGIN
  return (await ModsRoute.options.head?.({ loaderData: { mods, user: null } } as never)) as Head
}

function jsonLd(h: Head): Array<Record<string, unknown>> {
  return h.scripts.map((script) => JSON.parse(script.children))
}

describe('/mods head', () => {
  it('titles, describes and canonicalizes the page', async () => {
    const h = await head(MODS)

    expect(h.meta).toEqual(
      expect.arrayContaining([
        { title: 'Claude Code Mods with Real Previews | statuslin.es' },
        {
          name: 'description',
          content:
            'Claude Code mods with real previews from the terminal and Claude Desktop. See what each one can touch, then install it at the commit a person reviewed.',
        },
        { property: 'og:url', content: `${ORIGIN}/mods` },
      ]),
    )
    expect(h.links).toEqual([{ rel: 'canonical', href: `${ORIGIN}/mods` }])
  })

  it('lets crawlers index the page while it lists mods', async () => {
    expect((await head(MODS)).meta.find((m) => m.name === 'robots')).toBeUndefined()
  })

  it('keeps the page out of the index while no mod is published', async () => {
    expect((await head([])).meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('lists each mod page in the JSON-LD and answers the FAQ', async () => {
    const nodes = jsonLd(await head(MODS))

    const collection = nodes.find((n) => n['@type'] === 'CollectionPage') as {
      mainEntity: { itemListElement: Array<{ url: string }> }
    }
    expect(collection.mainEntity.itemListElement.map((item) => item.url)).toEqual([
      `${ORIGIN}/mods/meter`,
      `${ORIGIN}/mods/file-tree`,
    ])
    const faq = nodes.find((n) => n['@type'] === 'FAQPage') as {
      mainEntity: Array<{ name: string }>
    }
    expect(faq.mainEntity.map((q) => q.name)).toEqual(MODS_FAQ.map((entry) => entry.question))
  })
})
