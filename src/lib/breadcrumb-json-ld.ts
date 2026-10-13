import { MODS_PATH } from '@/lib/site'

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
