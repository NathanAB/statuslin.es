import { usePostHog } from '@posthog/react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AdoptPrompt } from '@/adopt/adopt-actions'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import { getViewerIsAuthor } from '@/gallery/authorship'
import { cardClickProperties } from '@/gallery/card-analytics'
import { configFactTiles } from '@/gallery/config-fact-tiles'
import { ConfigHeader } from '@/gallery/config-header'
import { configInstallFacts } from '@/gallery/config-install-facts'
import { DesktopNote } from '@/gallery/desktop-note'
import { DesktopPreviewBlock } from '@/gallery/desktop-preview-block'
import { DetailPageLayout } from '@/gallery/detail-page-layout'
import { getConfigDetail } from '@/gallery/functions'
import { OwnerUpdateStrip } from '@/gallery/owner-update-strip'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { configJsonLd, jsonLdScript } from '@/lib/json-ld'
import {
  configMetaDescription,
  configPageTitle,
  NOT_FOUND_TITLE,
  NOT_SHOWING_GUIDE_PATH,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getStatusLineModsFn } from '@/mods/functions'
import { ModCard } from '@/mods/mod-card'
import { configSocialMeta } from '@/og/meta'
import { orderByScenario, SCENARIO_BY_KEY } from '@/render/scenarios'
import { GalleryList, GalleryRow, RowFacts } from '@/ui/gallery-row'
import { HighlightedCode } from '@/ui/highlighted-code'
import { installsLabel } from '@/ui/install-count'
import { InstallFacts } from '@/ui/install-facts'
import { Stack } from '@/ui/layout'
import { PageSection } from '@/ui/page-section'
import { ScenarioRow } from '@/ui/scenario-row'
import { PageShell } from '@/ui/shell'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text, TextLink } from '@/ui/text'

export const Route = createFileRoute('/c/$slug')({
  loader: async ({ params }) => {
    const detail = await getConfigDetail({ data: { slug: params.slug } })
    if (!detail) throw notFound()
    const [user, viewerIsAuthor, mods] = await Promise.all([
      getSession(),
      getViewerIsAuthor({ data: { slug: params.slug } }),
      getStatusLineModsFn({ data: { tags: detail.tags } }),
    ])
    return { detail, user, viewerIsAuthor, mods }
  },
  head: ({ loaderData }) => {
    // loaderData is undefined when the loader throws notFound() (the 404 page),
    // so fall back to a sensible title instead of crashing.
    const detail = loaderData?.detail
    return {
      meta: [
        { title: detail ? configPageTitle(detail.title) : NOT_FOUND_TITLE },
        {
          name: 'description',
          content: configMetaDescription(detail?.description),
        },
        ...(detail
          ? configSocialMeta({
              slug: detail.slug,
              title: detail.title,
              description: detail.description,
            })
          : []),
      ],
      // Only a real config gets a canonical URL; the notFound page (no detail) is a 404 and
      // shouldn't point search engines at a canonical that doesn't exist.
      ...(detail ? { links: [canonicalLink(`/c/${detail.slug}`)] } : {}),
      scripts: detail
        ? configJsonLd(siteUrl(), {
            slug: detail.slug,
            title: detail.title,
            description: detail.description,
            interpreter: detail.interpreter,
            authorName: detail.author?.name ?? null,
            license: detail.license,
            keywords: detail.facetLabels,
            updatedAt: detail.updatedAt,
            primaryFacet: detail.primaryFacet,
          }).map(jsonLdScript)
        : [],
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>Status line not found.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: ConfigDetail,
})

function ConfigDetail() {
  const posthog = usePostHog()
  const { detail, user, viewerIsAuthor, mods } = Route.useLoaderData()
  const copyController = useRecordedCopy(detail.id, detail.copyCount)

  useEffect(() => {
    posthog.capture('statusline_detail_viewed', {
      configId: detail.id,
      slug: detail.slug,
      interpreter: detail.interpreter,
    })
  }, [posthog, detail.id, detail.slug, detail.interpreter])

  // Order previews by the canonical SCENARIOS order, not DB order.
  const orderedPreviews = orderByScenario(detail.previews)

  return (
    <PageShell user={user}>
      <DetailPageLayout
        notice={<OwnerUpdateStrip slug={detail.slug} viewerIsAuthor={viewerIsAuthor} />}
        header={<ConfigHeader detail={detail} />}
        beforeInstall={
          <InstallFacts
            heading="Before you install"
            facts={configInstallFacts(detail)}
            link={{ label: 'Not showing after you paste? Fix it', to: NOT_SHOWING_GUIDE_PATH }}
          />
        }
        install={
          <>
            <AdoptPrompt
              source={detail.source}
              interpreter={detail.interpreter}
              title={detail.title}
              controller={copyController}
            />
            {/* Once the preview shows it in Desktop, that names statusline-anywhere instead. */}
            {detail.desktop === null && <DesktopNote />}
          </>
        }
        preview={
          <Stack gap={4}>
            {orderedPreviews.length > 0 ? (
              <Stack gap={3}>
                {orderedPreviews.map((p) => {
                  const scenario = SCENARIO_BY_KEY.get(p.scenarioKey)
                  return (
                    <ScenarioRow
                      key={p.scenarioKey}
                      shortLabel={scenario?.shortLabel ?? p.scenarioKey}
                      title={scenario?.label ?? p.scenarioKey}
                      segments={p.segments}
                    />
                  )
                })}
              </Stack>
            ) : (
              <Text muted size="sm">
                No preview.
              </Text>
            )}
            {detail.desktop !== null && (
              <DesktopPreviewBlock desktop={detail.desktop} title={detail.title} />
            )}
          </Stack>
        }
        // Generated copy around the stored facts: the SEO answer to "what does this status line do?"
        whatItDoes={{ copy: detail.generatedContent, tiles: configFactTiles(detail) }}
        source={
          <HighlightedCode
            peek
            html={detail.sourceHtml}
            text={detail.source}
            copyLabel="Copy script"
            onCopied={() => copyController.record('script')}
          />
        }
        // Internal links: without these, every config page is a crawl dead end.
        related={
          <>
            {detail.related.length > 0 && (
              <PageSection title="More status lines">
                <GalleryList>
                  {detail.related.map((r, index) => (
                    <GalleryRow
                      key={r.slug}
                      to="/c/$slug"
                      params={{ slug: r.slug }}
                      onOpen={() =>
                        posthog.capture(
                          'statusline_card_clicked',
                          cardClickProperties(
                            { configId: r.configId, slug: r.slug },
                            { surface: 'related', position: index + 1 },
                          ),
                        )
                      }
                      title={r.title}
                      facts={
                        <RowFacts>
                          {[installsLabel(r.copyCount)].filter((fact) => fact !== null)}
                        </RowFacts>
                      }
                    >
                      {r.preview !== null ? (
                        <StatuslinePreview segments={r.preview} look="strip" />
                      ) : (
                        <Text muted size="sm">
                          No preview.
                        </Text>
                      )}
                    </GalleryRow>
                  ))}
                </GalleryList>
              </PageSection>
            )}
            {mods.length > 0 && (
              <PageSection title="Related mods">
                <GalleryList>
                  {mods.map((card, index) => (
                    <ModCard
                      key={card.slug}
                      card={card}
                      analytics={{ surface: 'related', position: index + 1 }}
                    />
                  ))}
                </GalleryList>
              </PageSection>
            )}
          </>
        }
      />
    </PageShell>
  )
}
