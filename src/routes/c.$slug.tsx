import { usePostHog } from '@posthog/react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AdoptPrompt, CopyScriptButton } from '@/adopt/adopt-actions'
import { getConfigDetail } from '@/gallery/functions'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { configJsonLd, jsonLdScript } from '@/lib/json-ld'
import { configPageTitle, NOT_FOUND_TITLE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { configSocialMeta } from '@/og/meta'
import { orderByScenario, SCENARIO_BY_KEY } from '@/render/scenarios'
import { AuthorChip } from '@/ui/author-chip'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { ConfigBadges } from '@/ui/config-badges'
import { HighlightedCode } from '@/ui/highlighted-code'
import { Row, Stack } from '@/ui/layout'
import { ScenarioRow } from '@/ui/scenario-row'
import { SectionCard } from '@/ui/section-card'
import { PageShell } from '@/ui/shell'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StretchedLink } from '@/ui/stretched-link'
import { Heading, Text, TextLink } from '@/ui/text'
import { UpvoteButton } from '@/votes/upvote-button'

export const Route = createFileRoute('/c/$slug')({
  loader: async ({ params }) => {
    const detail = await getConfigDetail({ data: { slug: params.slug } })
    if (!detail) throw notFound()
    const user = await getSession()
    return { detail, user }
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
          content:
            detail?.description ||
            'A reviewed Claude Code status line — rendered preview, source, and one-paste install.',
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
  const { detail, user } = Route.useLoaderData()

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
      <Stack gap={6}>
        <Stack gap={3}>
          <Row gap={3} wrap justify="between">
            <Row gap={3}>
              <Heading level={1}>{detail.title}</Heading>
              <UpvoteButton
                configId={detail.id}
                slug={detail.slug}
                initialCount={detail.upvoteCount}
                initialVoted={detail.hasVoted}
                signedIn={!!user}
              />
            </Row>
            <ConfigBadges
              interpreter={detail.interpreter}
              networkHosts={detail.networkHosts}
              readsClaudeToken={detail.readsClaudeToken}
            />
          </Row>

          {(detail.author || detail.description) && (
            <Stack gap={2}>
              {detail.author && (
                <Row gap={1.5}>
                  <Text muted size="sm">
                    by
                  </Text>
                  <AuthorChip author={detail.author} />
                </Row>
              )}
              {detail.description && (
                <Text muted size="sm">
                  {detail.description}
                </Text>
              )}
            </Stack>
          )}
        </Stack>

        <AdoptPrompt
          source={detail.source}
          interpreter={detail.interpreter}
          title={detail.title}
          configId={detail.id}
          copyCount={detail.copyCount}
        />

        {/* All scenarios, stacked */}
        <SectionCard title="Preview">
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
              No preview available.
            </Text>
          )}
        </SectionCard>

        {/* Source */}
        <SectionCard
          title="Source"
          action={<CopyScriptButton source={detail.source} configId={detail.id} />}
        >
          <HighlightedCode html={detail.sourceHtml} />
        </SectionCard>

        {/* Internal links: without these, every config page is a crawl dead end. */}
        {detail.related.length > 0 && (
          <SectionCard title="More status lines">
            <Stack gap={3}>
              {detail.related.map((r) => (
                <Card key={r.slug} interactive>
                  <CardHeader>
                    <Row gap={2}>
                      <CardTitle>
                        <StretchedLink to="/c/$slug" params={{ slug: r.slug }}>
                          {r.title}
                        </StretchedLink>
                      </CardTitle>
                      <Text muted size="sm">
                        ⇧ {r.upvoteCount}
                      </Text>
                    </Row>
                  </CardHeader>
                  {r.preview !== null && (
                    <CardContent>
                      <StatuslinePreview segments={r.preview} />
                    </CardContent>
                  )}
                </Card>
              ))}
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </PageShell>
  )
}
