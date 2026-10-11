import { usePostHog } from '@posthog/react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AdoptPrompt } from '@/adopt/adopt-actions'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import { getViewerIsAuthor } from '@/gallery/authorship'
import { configFactTiles } from '@/gallery/config-fact-tiles'
import { ConfigHeader } from '@/gallery/config-header'
import { DesktopNote } from '@/gallery/desktop-note'
import { DetailPageLayout } from '@/gallery/detail-page-layout'
import { getConfigDetail } from '@/gallery/functions'
import { OwnerUpdateStrip } from '@/gallery/owner-update-strip'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { configJsonLd, jsonLdScript } from '@/lib/json-ld'
import { configMetaDescription, configPageTitle, NOT_FOUND_TITLE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { configSocialMeta } from '@/og/meta'
import { orderByScenario, SCENARIO_BY_KEY } from '@/render/scenarios'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { CopyCount } from '@/ui/copy-count'
import { HighlightedCode } from '@/ui/highlighted-code'
import { Row, Stack } from '@/ui/layout'
import { ScenarioRow } from '@/ui/scenario-row'
import { SectionCard } from '@/ui/section-card'
import { PageShell } from '@/ui/shell'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StretchedLink } from '@/ui/stretched-link'
import { Text, TextLink } from '@/ui/text'

export const Route = createFileRoute('/c/$slug')({
  loader: async ({ params }) => {
    const detail = await getConfigDetail({ data: { slug: params.slug } })
    if (!detail) throw notFound()
    const [user, viewerIsAuthor] = await Promise.all([
      getSession(),
      getViewerIsAuthor({ data: { slug: params.slug } }),
    ])
    return { detail, user, viewerIsAuthor }
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
            generatedContent: detail.generatedContent,
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
  const { detail, user, viewerIsAuthor } = Route.useLoaderData()
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
        install={
          <>
            <AdoptPrompt
              source={detail.source}
              interpreter={detail.interpreter}
              title={detail.title}
              controller={copyController}
            />
            <DesktopNote surface="config_page" />
          </>
        }
        preview={
          orderedPreviews.length > 0 ? (
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
              No preview available.
            </Text>
          )
        }
        // Generated copy around the stored facts: the SEO answer to "what does this status line do?"
        whatItDoes={{ copy: detail.generatedContent, tiles: configFactTiles(detail) }}
        source={
          <HighlightedCode
            html={detail.sourceHtml}
            text={detail.source}
            copyLabel="Copy script"
            onCopied={() => copyController.record('script')}
          />
        }
        // Internal links: without these, every config page is a crawl dead end.
        related={
          detail.related.length > 0 && (
            <SectionCard title="More status lines" headingLevel={2}>
              <Stack gap={3}>
                {detail.related.map((r, index) => (
                  <Card key={r.slug} interactive>
                    <CardHeader>
                      <Row gap={2}>
                        <CardTitle>
                          <StretchedLink
                            to="/c/$slug"
                            params={{ slug: r.slug }}
                            onClick={() =>
                              posthog.capture('statusline_card_clicked', {
                                configId: r.configId,
                                slug: r.slug,
                                surface: 'related',
                                position: index + 1,
                              })
                            }
                          >
                            {r.title}
                          </StretchedLink>
                        </CardTitle>
                        <CopyCount count={r.copyCount} />
                      </Row>
                    </CardHeader>
                    <CardContent>
                      {r.preview !== null ? (
                        <StatuslinePreview segments={r.preview} />
                      ) : (
                        <Text muted size="sm">
                          No preview.
                        </Text>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </SectionCard>
          )
        }
      />
    </PageShell>
  )
}
