import { MODS_PATH, modPath } from '@/lib/site'

/** The first crumb of every breadcrumb, on the page and in its JSON-LD. */
export const HOME_CRUMB_NAME = 'Status lines'

/** The crumb between home and every mod page: the mods page. */
export const MODS_CRUMB = { name: 'Mods', to: MODS_PATH } as const

/** A BreadcrumbList from the trail's crumbs, home first, each `item` an absolute URL. */
export function breadcrumbJsonLd(crumbs: Array<{ name: string; item: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      ...crumb,
    })),
  }
}

/** A mod page's breadcrumb, matching the one it shows: home › Mods › the mod. */
export function modJsonLd(origin: string, mod: { slug: string; title: string }): object[] {
  return [
    breadcrumbJsonLd([
      { name: HOME_CRUMB_NAME, item: origin },
      { name: MODS_CRUMB.name, item: `${origin}${MODS_PATH}` },
      { name: mod.title, item: `${origin}${modPath(mod.slug)}` },
    ]),
  ]
}
