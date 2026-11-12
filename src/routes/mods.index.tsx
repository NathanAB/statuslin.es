import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { faqPageJsonLd, jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import {
  MOD_SAFETY_GUIDE_PATH,
  MODS_DESCRIPTION,
  MODS_HEADING,
  MODS_TITLE_BASE,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
} from '@/lib/page-title'
import { PAGE_TITLE_BRAND } from '@/lib/search-text'
import { MODS_PATH, modPath, siteUrl } from '@/lib/site'
import { getGalleryModsFn } from '@/mods/gallery-functions'
import { MarketplaceLine } from '@/mods/marketplace-line'
import { ModCard } from '@/mods/mod-card'
import { modsFaq } from '@/mods/mods-page-faq'
import { listUnreviewedModsFn } from '@/mods/unreviewed-functions'
import { UnreviewedModsSection } from '@/mods/unreviewed-mods-section'
import { staticPageSocialMeta } from '@/og/meta'
import { FaqSection } from '@/ui/faq-section'
import { GalleryList } from '@/ui/gallery-row'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/mods/')({
  loader: async () => {
    const [mods, unreviewed, user] = await Promise.all([
      getGalleryModsFn({ data: { sort: 'top' } }),
      listUnreviewedModsFn(),
      getSession(),
    ])
    return {
      mods: mods.items.flatMap(({ item }) => (item.kind === 'mod' ? [item.card] : [])),
      unreviewed,
      user,
      origin: siteUrl(),
    }
  },
  head: ({ loaderData }) => {
    const mods = loaderData?.mods ?? []
    const faq = faqPageJsonLd(modsFaq())
    return {
      meta: [
        { title: `${MODS_TITLE_BASE}${PAGE_TITLE_BRAND}` },
        { name: 'description', content: MODS_DESCRIPTION },
        ...(mods.length === 0 ? [{ name: 'robots', content: 'noindex, follow' } as const] : []),
        ...staticPageSocialMeta({
          path: MODS_PATH,
          title: MODS_TITLE_BASE,
          description: MODS_DESCRIPTION,
        }),
      ],
      links: [canonicalLink(MODS_PATH)],
      scripts: [
        ...configListPageJsonLd(
          siteUrl(),
          { path: MODS_PATH, name: MODS_TITLE_BASE },
          mods,
          modPath,
        ),
        ...(faq ? [faq] : []),
      ].map(jsonLdScript),
    }
  },
  component: ModsPage,
})

function ModsPage() {
  const { mods, unreviewed, user, origin } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>{MODS_HEADING}</Heading>
          <Text muted>
            Plugins that change how Claude Code looks and works, ranked by installs. Each mod's
            preview is recorded from its real output in the terminal and Claude Desktop. Every
            version is reviewed before it goes live, and the install is pinned to the reviewed
            commit. For status lines, see <TextLink to="/">the gallery</TextLink>.
          </Text>
          <Text muted>
            New to mods?{' '}
            <TextLink to={STATUS_LINES_VS_MODS_GUIDE_PATH}>Compare them with status lines</TextLink>{' '}
            or see <TextLink to={MOD_SAFETY_GUIDE_PATH}>what a mod can touch</TextLink>.
          </Text>
        </Stack>
        {mods.length > 0 ? (
          <Stack gap={4}>
            <MarketplaceLine origin={origin} />
            <VisuallyHidden as="h2">Mods</VisuallyHidden>
            <GalleryList>
              {mods.map((card, index) => (
                <ModCard
                  key={card.slug}
                  card={card}
                  analytics={{ surface: 'mods', position: index + 1 }}
                />
              ))}
            </GalleryList>
          </Stack>
        ) : (
          <Text muted>No mods yet.</Text>
        )}
        <UnreviewedModsSection mods={unreviewed} />
        <FaqSection entries={modsFaq()} />
      </Stack>
    </PageShell>
  )
}
