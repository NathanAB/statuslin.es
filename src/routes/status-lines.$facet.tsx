import { createFileRoute, notFound } from '@tanstack/react-router'
import { ConfigBadges } from '@/gallery/config-badges'
import { GalleryConfigCard } from '@/gallery/config-card'
import { FACET_MOD_COPY, type FacetModCopy } from '@/gallery/facet-copy'
import { FACET_BY_SLUG, type Facet } from '@/gallery/facets'
import { getFacetPage } from '@/gallery/functions'
import { mergeGalleryItems } from '@/gallery/gallery-items'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { facetJsonLd, jsonLdScript } from '@/lib/json-ld'
import { brandedPageTitle, NOT_FOUND_TITLE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getGalleryModsFn, getPublishedModTagsFn } from '@/mods/gallery-functions'
import { ModCard } from '@/mods/mod-card'
import { staticPageSocialMeta } from '@/og/meta'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/status-lines/$facet')({
  loader: async ({ params }) => {
    const [page, mods] = await Promise.all([
      getPublishedModTagsFn().then((modTags) =>
        getFacetPage({ data: { facet: params.facet, modTags } }),
      ),
      getGalleryModsFn({ data: { sort: 'top', tags: [params.facet] } }),
    ])
    if (!page) throw notFound()
    return {
      page,
      items: mergeGalleryItems([page.configs.items, mods.items]),
      mods: mods.total,
      user: await getSession(),
    }
  },
  head: ({ loaderData }) => {
    const facet = loaderData ? FACET_BY_SLUG.get(loaderData.page.slug) : undefined
    if (!facet || !loaderData) return { meta: [{ title: NOT_FOUND_TITLE }] }
    const path = `/status-lines/${facet.slug}`
    const { titleBase, metaDescription } = facetPageCopy(facet, loaderData.mods ?? 0)
    return {
      meta: [
        { title: brandedPageTitle(titleBase) },
        { name: 'description', content: metaDescription },
        ...(!loaderData.page.indexable
          ? [{ name: 'robots', content: 'noindex, follow' } as const]
          : []),
        ...staticPageSocialMeta({
          path,
          title: titleBase,
          description: metaDescription,
        }),
      ],
      links: [canonicalLink(path)],
      scripts: facetJsonLd(
        siteUrl(),
        { slug: facet.slug, titleBase },
        loaderData.items.map(({ kind, card }) => ({ kind, slug: card.slug, title: card.title })),
        loaderData.page.updated,
        { includeCollectionPage: loaderData.page.indexable, faq: facet.faq },
      ).map(jsonLdScript),
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>No status lines here yet.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: FacetPage,
})

function FacetPage() {
  const { page, items, mods, user } = Route.useLoaderData()
  const facet = FACET_BY_SLUG.get(page.slug)
  if (!facet) return null
  const copy = facetPageCopy(facet, mods)
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>{copy.heading}</Heading>
          {(facet.intro ?? []).map((paragraph) => (
            <Text key={paragraph.slice(0, 24)} muted size="sm">
              {paragraph}
            </Text>
          ))}
          {facet.answer ? (
            <Text size="sm">
              <InlineCodeText text={facet.answer} />
            </Text>
          ) : null}
          {copy.kindNote ? (
            <Text muted size="sm">
              {copy.kindNote}
            </Text>
          ) : null}
          <Text muted size="sm">
            {publishedCountLine(page.configs.total, mods)}
          </Text>
          {page.updated ? (
            <Text muted size="sm">
              Updated {page.updated}
            </Text>
          ) : null}
        </Stack>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines and mods</VisuallyHidden>
          {items.map((item, index) =>
            item.kind === 'mod' ? (
              <ModCard
                key={`mod:${item.card.slug}`}
                card={item.card}
                analytics={{ surface: 'facet', facet: page.slug, position: index + 1 }}
              />
            ) : (
              <GalleryConfigCard
                key={`status-line:${item.card.slug}`}
                card={item.card}
                analytics={{ surface: 'facet', facet: page.slug, position: index + 1 }}
              />
            ),
          )}
        </Stack>
        {facet.faq ? <FaqSection entries={facet.faq} /> : null}
        {page.otherFacets.length > 0 ? (
          <Stack gap={2}>
            <Text muted size="sm">
              More ways to browse:
            </Text>
            <ConfigBadges tags={page.otherFacets.map((f) => f.slug)} networkHosts={[]} />
          </Stack>
        ) : null}
      </Stack>
    </PageShell>
  )
}

/** The page's title, heading and description: the mod copy while the page lists a mod. */
function facetPageCopy(
  facet: Facet,
  modCount: number,
): Omit<FacetModCopy, 'kindNote'> & { kindNote?: string } {
  const withMods = FACET_MOD_COPY[facet.slug]
  if (withMods && modCount > 0) return withMods
  return {
    titleBase: facet.titleBase ?? '',
    heading: facet.heading ?? '',
    metaDescription: facet.metaDescription ?? '',
  }
}

function publishedCountLine(statusLines: number, mods: number): string {
  const statusLineCount = `${statusLines} published ${statusLines === 1 ? 'status line' : 'status lines'}`
  const modNoun = mods === 1 ? 'mod' : 'mods'
  if (mods === 0) return `${statusLineCount}.`
  if (statusLines === 0) return `${mods} published ${modNoun}.`
  return `${statusLineCount} and ${mods} ${modNoun}.`
}
