import { configs, configVersions, user } from '@/db/schema'
import { type AnsiSegment, INTERPRETERS, type Interpreter } from '@/render/types'
import type { GalleryCard } from './queries'

const VALID_INTERPRETERS = new Set<Interpreter>(INTERPRETERS)

export const galleryCardSelection = {
  config: {
    id: configs.id,
    slug: configs.slug,
    copyCount: configs.copyCount,
    allTags: configs.allTags,
  },
  version: {
    title: configVersions.title,
    description: configVersions.description,
    interpreter: configVersions.interpreter,
    contentSha256: configVersions.contentSha256,
    networkHosts: configVersions.networkHosts,
    readsClaudeToken: configVersions.readsClaudeToken,
  },
  author: {
    name: user.name,
    username: user.username,
    image: user.image,
  },
}

type GalleryCardRow = {
  config: Pick<typeof configs.$inferSelect, 'allTags' | 'copyCount' | 'id' | 'slug'>
  version: Pick<
    typeof configVersions.$inferSelect,
    'contentSha256' | 'description' | 'interpreter' | 'networkHosts' | 'readsClaudeToken' | 'title'
  >
  author: Pick<typeof user.$inferSelect, 'image' | 'name' | 'username'> | null
}

/** Narrows the free-form DB `interpreter` column to the Interpreter union; falls back to 'bash'. */
export function coerceInterpreter(value: string): Interpreter {
  return VALID_INTERPRETERS.has(value as Interpreter) ? (value as Interpreter) : 'bash'
}

/** Shared row → GalleryCard mapping for the home gallery and facet pages. */
export function mapCardRows(
  rows: GalleryCardRow[],
  cardPreviews: Map<string, AnsiSegment[]>,
): GalleryCard[] {
  return rows.map((row) => mapCardRow(row, cardPreviews))
}

export function mapCardRow(
  r: GalleryCardRow,
  cardPreviews: Map<string, AnsiSegment[]>,
): GalleryCard {
  return {
    configId: r.config.id,
    slug: r.config.slug,
    title: r.version.title,
    description: r.version.description,
    interpreter: coerceInterpreter(r.version.interpreter),
    copyCount: r.config.copyCount,
    author: r.author
      ? {
          name: r.author.name,
          username: r.author.username ?? null,
          image: r.author.image ?? null,
        }
      : null,
    preview: cardPreviews.get(r.version.contentSha256) ?? null,
    networkHosts: r.version.networkHosts ?? [],
    readsClaudeToken: r.version.readsClaudeToken ?? false,
    tags: r.config.allTags ?? [],
  }
}
