// The catalogue of reviewed mods, read from statuslin.es. Everything here comes from the network,
// so it is hostile until checked: each field is typed, capped and stripped of control characters,
// and an entry that fails is dropped. Only a checked slug ever reaches the prompt box.

/** The site the mod reads, and the one host it reaches. */
export const SITE = 'https://statuslin.es'

/** The one URL the mod fetches. */
export const CATALOGUE_URL = `${SITE}/gallery.json`

/** The catalogue format this mod reads; the site bumps it on any change an old reader would misread. */
export const CATALOGUE_VERSION = 1

/** The marketplace every listed mod installs from. */
export const MARKETPLACE = { name: 'statuslines', url: `${SITE}/marketplace.json` } as const

/** How long a fetched catalogue is used before asking again: the site's own `max-age`. */
export const FRESH_FOR_MS = 5 * 60_000

/** Generous bounds on what a terminal is asked to draw, well past what the site writes today. */
const MAX = {
  bodyChars: 2_000_000,
  mods: 500,
  // The site's own limit on a plugin name.
  slug: 100,
  title: 200,
  author: 100,
  summary: 400,
  tags: 50,
  tag: 100,
  facts: 20,
  factLabel: 60,
  factValue: 1_000,
  license: 200,
  date: 40,
} as const

/** Claude Code's plugin name rule. */
export const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Control and format characters, and line and paragraph separators: none may reach a terminal. */
export const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu

/** A mod's marketplace entry name, checked against the plugin name rule. */
export type Slug = string & { readonly __brand: 'Slug' }

export function isSlug(text: string): text is Slug {
  return text.length <= MAX.slug && PLUGIN_NAME.test(text)
}

interface Fact {
  label: string
  value: string
}

export interface GalleryMod {
  slug: Slug
  title: string
  author: string
  summary: string
  /** Null while the site hides a small count. */
  installs: number | null
  tags: string[]
  facts: Fact[]
  license: string | null
}

export interface Catalogue {
  /** When the site built it, in epoch milliseconds. */
  generatedAt: number
  mods: GalleryMod[]
  /** Entries left out because they failed a check. */
  dropped: number
}

export type CatalogueRead =
  | { kind: 'read'; catalogue: Catalogue }
  | { kind: 'refused'; reason: string }

const refused = (reason: string): CatalogueRead => ({ kind: 'refused', reason })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One line of printable text: whitespace runs become one space, unprintable characters go. */
export function plain(text: string): string {
  return text.replace(/\s+/g, ' ').replace(UNPRINTABLE, '').trim()
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = plain(value)
  return cleaned.length <= max ? cleaned : undefined
}

const filled = (value: string | undefined) => (value === '' ? undefined : value)

function list<T>(value: unknown, max: number, read: (item: unknown) => T | undefined) {
  if (!Array.isArray(value) || value.length > max) return undefined
  const items = value.map(read)
  return items.every((item): item is T => item !== undefined) ? items : undefined
}

function readFact(value: unknown): Fact | undefined {
  if (!isRecord(value)) return undefined
  const label = filled(text(value.label, MAX.factLabel))
  const factValue = text(value.value, MAX.factValue)
  return label === undefined || factValue === undefined ? undefined : { label, value: factValue }
}

function readInstalls(value: unknown): number | null | undefined {
  if (value === null) return null
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

type Unchecked<T> = { [K in keyof T]: T[K] | undefined }

function isComplete(mod: Unchecked<GalleryMod>): mod is GalleryMod {
  return Object.values(mod).every((field) => field !== undefined)
}

function readMod(value: unknown): GalleryMod | undefined {
  if (!isRecord(value) || typeof value.slug !== 'string' || !isSlug(value.slug)) return undefined
  const mod: Unchecked<GalleryMod> = {
    slug: value.slug,
    title: filled(text(value.title, MAX.title)),
    author: text(value.author, MAX.author),
    summary: text(value.summary, MAX.summary),
    installs: readInstalls(value.installs),
    tags: list(value.tags, MAX.tags, (tag) => text(tag, MAX.tag)),
    facts: list(value.facts, MAX.facts, readFact),
    license: value.license === null ? null : text(value.license, MAX.license),
  }
  return isComplete(mod) ? mod : undefined
}

function readDate(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length > MAX.date) return undefined
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : date
}

/** Checks a catalogue document, as parsed from JSON, and reads the entries that pass. */
export function parseCatalogue(document: unknown): CatalogueRead {
  if (!isRecord(document)) return refused('The catalogue is not a JSON object.')
  if (document.version !== CATALOGUE_VERSION) {
    return refused('The catalogue is in a format this Mod Gallery cannot read. Update Mod Gallery.')
  }
  if (document.marketplace !== MARKETPLACE.name) {
    return refused('The catalogue names a marketplace this Mod Gallery does not install from.')
  }
  const generatedAt = readDate(document.generatedAt)
  if (generatedAt === undefined) return refused('The catalogue has no date.')
  if (!Array.isArray(document.mods)) return refused('The catalogue lists no mods.')

  const mods: GalleryMod[] = []
  const seen = new Set<string>()
  for (const entry of document.mods.slice(0, MAX.mods)) {
    const mod = readMod(entry)
    if (mod === undefined || seen.has(mod.slug)) continue
    seen.add(mod.slug)
    mods.push(mod)
  }
  return {
    kind: 'read',
    catalogue: { generatedAt, mods, dropped: document.mods.length - mods.length },
  }
}

/** Checks a catalogue body, as text, and reads the entries that pass. */
function readCatalogueText(text: string): CatalogueRead {
  if (text.length > MAX.bodyChars) return refused('The catalogue is too large to read.')
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return refused('The catalogue is not JSON.')
  }
  return parseCatalogue(document)
}

/** Reads the site's answer to a fetch of `CATALOGUE_URL`. */
export function readCatalogueResponse(response: { status: number; text: string }): CatalogueRead {
  if (response.status < 200 || response.status > 299) {
    return refused(`statuslin.es answered ${response.status}.`)
  }
  return readCatalogueText(response.text)
}

/** Reads back what the store holds, through the same checks; undefined when it holds nothing usable. */
export function readCache(
  stored: unknown,
): { catalogue: Catalogue; fetchedAt: number } | undefined {
  if (
    !isRecord(stored) ||
    typeof stored.fetchedAt !== 'number' ||
    typeof stored.text !== 'string'
  ) {
    return undefined
  }
  const read = readCatalogueText(stored.text)
  return read.kind === 'read'
    ? { catalogue: read.catalogue, fetchedAt: stored.fetchedAt }
    : undefined
}
