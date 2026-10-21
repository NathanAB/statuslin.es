import { GUIDE_PATH, STATUS_LINES_PATH } from '@/lib/page-title'
import { MODS_PATH, SITE_NAME } from '@/lib/site'

/** The first crumb of every breadcrumb, on the page and in its JSON-LD. */
export const HOME_CRUMB_NAME = SITE_NAME

/** The crumb between home and every mod page: the mods page. */
export const MODS_CRUMB = { name: 'Mods', to: MODS_PATH } as const

/** The crumb between home and every facet page: the topics hub, whose topics list both kinds. */
export const STATUS_LINES_CRUMB = { name: 'Topics', to: STATUS_LINES_PATH } as const

/** The crumb between home and every guide page, named as the header's nav link names it. */
export const GUIDE_CRUMB = { name: 'Guide', to: GUIDE_PATH } as const

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
