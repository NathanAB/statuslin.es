import { PERSONLESS } from '@/lib/posthog-person'
import type { ServerEvent } from '@/lib/posthog-server'
import { listingBadgePath, listingCardPath, MARKETPLACE_PATH, modPath } from '@/lib/site'
import { shownInstallCount } from '@/ui/install-count'
import { catalogClient, MARKETPLACE_NAME } from './marketplace'
import { modPageReachTiles } from './mod-fact-tiles'
import type { ModDetail } from './queries'
import { CONTROL_OR_FORMAT } from './terminal-line'

/** Bump on any change a reader written against the old shape would misread: an installed mod reads it. */
const GALLERY_CATALOGUE_VERSION = 1

const MAX_SUMMARY_CHARS = 300

/** A published mod, with what its page builds its summary and reach tiles from. */
export type GalleryCatalogueMod = Pick<
  ModDetail,
  | 'slug'
  | 'title'
  | 'description'
  | 'authorGithub'
  | 'copyCount'
  | 'tags'
  | 'license'
  | 'footprint'
  | 'preview'
  | 'desktop'
  | 'generatedContent'
>

interface GalleryCatalogueEntry {
  slug: string
  title: string
  author: string
  summary: string
  /** Null while the count is too small for the page to show. */
  installs: number | null
  tags: string[]
  facts: { label: string; value: string }[]
  license: string | null
  url: string
  badgeUrl: string
  cardUrl: string
}

/** The `/gallery.json` document. */
export interface GalleryCatalogue {
  version: typeof GALLERY_CATALOGUE_VERSION
  generatedAt: string
  marketplace: typeof MARKETPLACE_NAME
  marketplaceUrl: string
  mods: GalleryCatalogueEntry[]
}

const UNPRINTABLE = new RegExp(CONTROL_OR_FORMAT.source, 'gu')

/** Authors write these strings, and a terminal may print them: no escape sequence survives. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').replace(UNPRINTABLE, '').trim()
}

function capped(text: string): string {
  if (text.length <= MAX_SUMMARY_CHARS) return text
  const room = text.slice(0, MAX_SUMMARY_CHARS - 1)
  const lastSpace = room.lastIndexOf(' ')
  const endsOnWord = text.charAt(room.length) === ' ' || lastSpace <= 0
  return `${(endsOnWord ? room : room.slice(0, lastSpace)).trimEnd()}…`
}

function catalogueEntry(origin: string, mod: GalleryCatalogueMod): GalleryCatalogueEntry {
  return {
    slug: mod.slug,
    title: plain(mod.title),
    author: plain(mod.authorGithub),
    // The mod page leads with the reviewed summary, else the author's description.
    summary: capped(plain(mod.generatedContent?.summary ?? mod.description)),
    installs: shownInstallCount(mod.copyCount),
    tags: mod.tags.map(plain),
    facts: modPageReachTiles(mod).map(({ label, value }) => ({ label, value: plain(value) })),
    license: mod.license === null ? null : plain(mod.license),
    url: `${origin}${modPath(mod.slug)}`,
    badgeUrl: `${origin}${listingBadgePath('mod', mod.slug)}`,
    cardUrl: `${origin}${listingCardPath('mod', mod.slug)}`,
  }
}

export function buildGalleryCatalogue(
  origin: string,
  mods: GalleryCatalogueMod[],
  now: Date,
): GalleryCatalogue {
  return {
    version: GALLERY_CATALOGUE_VERSION,
    generatedAt: now.toISOString(),
    marketplace: MARKETPLACE_NAME,
    marketplaceUrl: `${origin}${MARKETPLACE_PATH}`,
    mods: mods.map((mod) => catalogueEntry(origin, mod)),
  }
}

/** Anonymous, as for the marketplace: tools fetch the file without any visitor identity. */
export function galleryFetchedEvent(modCount: number, userAgent: string | null): ServerEvent {
  return {
    distinctId: 'gallery',
    event: 'gallery_fetched',
    properties: { modCount, client: catalogClient(userAgent), ...PERSONLESS },
  }
}
