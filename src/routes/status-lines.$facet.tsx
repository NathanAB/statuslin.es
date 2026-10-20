import { createFileRoute, notFound } from '@tanstack/react-router'
import { GalleryConfigCard } from '@/gallery/config-card'
import { DetailBreadcrumb } from '@/gallery/detail-breadcrumb'
import { FACET_KIND_NOTE } from '@/gallery/facet-copy'
import { BrowseOnLinks, FacetTopicLinks } from '@/gallery/facet-links'
import { facetPageCopy, facetTopicName } from '@/gallery/facet-page-copy'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { getFacetPage } from '@/gallery/functions'
import { mergeGalleryItems } from '@/gallery/gallery-items'
import { kindCount } from '@/gallery/kind-count'
import { getSession } from '@/lib/auth-functions'
import { STATUS_LINES_CRUMB } from '@/lib/breadcrumb-json-ld'
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
import { ShowAllList } from '@/ui/show-all-list'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/** The rows a facet page shows before its Show all button. */
const ROWS_SHOWN = 12

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
        { slug: facet.slug, titleBase, topic: facetTopicName(facet) },
        loaderData.items.map(({ kind, card }) => ({ kind, slug: card.slug, title: card.title })),
        loaderData.page.updated,
        { includeCollectionPage: loaderData.page.indexable, faq: facet.faq },
      ).map(jsonLdScript),
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>Nothing here yet.</Text>
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
          <DetailBreadcrumb trail={[STATUS_LINES_CRUMB]} title={facetTopicName(facet)} />
          <Heading level={1}>{copy.heading}</Heading>
          <FacetTopicLinks current={page.slug} others={page.otherFacets} />
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
          {copy.listsMods ? (
            <Text muted size="sm">
              {FACET_KIND_NOTE}
            </Text>
          ) : null}
          <Text muted size="sm">
            {kindCount(page.configs.total, mods)}.
          </Text>
          {page.updated ? (
            <Text muted size="sm">
              Updated {page.updated}
            </Text>
          ) : null}
          <Text muted size="sm">
            Open one to copy its install prompt.
          </Text>
        </Stack>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines and mods</VisuallyHidden>
          <ShowAllList shown={ROWS_SHOWN}>
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
          </ShowAllList>
        </Stack>
        {facet.faq ? <FaqSection entries={facet.faq} /> : null}
        <BrowseOnLinks />
      </Stack>
    </PageShell>
  )
}
