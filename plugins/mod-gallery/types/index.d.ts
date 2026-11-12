// The values the pane keeps in $.state. A contract imports nothing, so it restates the catalogue's
// shape from hooks/catalogue.ts; register.tsx passes values each way between the two, so
// `tsc -p plugins/mod-gallery` fails when they drift.

export type Slug = string & { readonly __brand: 'Slug' }

export type Fact = { label: string; value: string }

export type GalleryMod = {
  slug: Slug
  title: string
  author: string
  summary: string
  installs: number | null
  tags: string[]
  facts: Fact[]
  license: string | null
}

export type Catalogue = { generatedAt: number; mods: GalleryMod[]; dropped: number }

/** The catalogue as the pane shows it. */
export type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; catalogue: Catalogue; fetchedAt: number; refreshError: string | null }
  | { kind: 'failed'; reason: string }

/** Where the person is in the pane: the filter, the page, and the mod open in detail. */
export type Browse = {
  query: string
  page: number
  slug: string | null
  notice: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'mod-gallery': { load: Shaped<Load>; browse: Shaped<Browse> }
  }
}
