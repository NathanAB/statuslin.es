import { tagKeywords } from '@/gallery/facets'
import { breadcrumbJsonLd, HOME_CRUMB_NAME, MODS_CRUMB } from '@/lib/breadcrumb-json-ld'
import { faqPageJsonLd, RUNTIME_PLATFORM } from '@/lib/json-ld'
import { MODS_PATH, modPath } from '@/lib/site'
import { modSourceUrl } from './install'
import type { ModDetail } from './queries'

/**
 * A mod page as SoftwareSourceCode + its breadcrumb (home › Mods › the mod, as the page shows),
 * then a FAQPage when its reviewed copy has the questions the page shows. The source is the folder
 * at the pinned commit, the one a person reviewed. A mod without a licence claims none.
 */
export function modJsonLd(
  origin: string,
  mod: Pick<
    ModDetail,
    | 'slug'
    | 'title'
    | 'description'
    | 'authorGithub'
    | 'repoUrl'
    | 'path'
    | 'commitSha'
    | 'license'
    | 'tags'
    | 'updatedAt'
    | 'generatedContent'
  >,
): object[] {
  const url = `${origin}${modPath(mod.slug)}`
  const faqPage = faqPageJsonLd(mod.generatedContent?.faq ?? [])
  const nodes = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: mod.title,
      description: mod.description,
      url,
      codeRepository: modSourceUrl(mod),
      runtimePlatform: RUNTIME_PLATFORM,
      author: { '@type': 'Person', name: mod.authorGithub },
      ...(mod.license ? { license: mod.license } : {}),
      dateModified: mod.updatedAt,
      ...(mod.tags.length > 0 ? { keywords: tagKeywords(mod.tags).join(', ') } : {}),
    },
    breadcrumbJsonLd([
      { name: HOME_CRUMB_NAME, item: origin },
      { name: MODS_CRUMB.name, item: `${origin}${MODS_PATH}` },
      { name: mod.title, item: url },
    ]),
  ]
  return faqPage ? [...nodes, faqPage] : nodes
}
