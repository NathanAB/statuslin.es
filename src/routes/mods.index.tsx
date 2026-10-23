import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { faqPageJsonLd, jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { MOD_SAFETY_GUIDE_PATH, STATUS_LINES_VS_MODS_GUIDE_PATH } from '@/lib/page-title'
import { MODS_PATH, modPath, siteUrl } from '@/lib/site'
import { getGalleryModsFn } from '@/mods/gallery-functions'
import { MarketplaceLine } from '@/mods/marketplace-line'
import { ModCard } from '@/mods/mod-card'
import { modsFaq } from '@/mods/mods-page-faq'
import { staticPageSocialMeta } from '@/og/meta'
import { FaqSection } from '@/ui/faq-section'
import { GalleryList } from '@/ui/gallery-row'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

// The home page owns the bare "Claude Code mods" search, so this page is the best-of list: the
// plugin mods ranked by installs, which listicles rank for without showing previews.
const TITLE_BASE = 'Best Claude Code Mods, Ranked by Installs'
const DESCRIPTION =
  'The best Claude Code mods, ranked by installs and previewed in the terminal and Claude Desktop. Each is reviewed before listing.'

export const Route = createFileRoute('/mods/')({
  loader: async () => {
    const [mods, user] = await Promise.all([
      getGalleryModsFn({ data: { sort: 'top' } }),
      getSession(),
    ])
    return {
      mods: mods.items.flatMap(({ item }) => (item.kind === 'mod' ? [item.card] : [])),
      user,
      origin: siteUrl(),
    }
  },
  head: ({ loaderData }) => {
    const mods = loaderData?.mods ?? []
    const faq = faqPageJsonLd(modsFaq())
    return {
      meta: [
        { title: `${TITLE_BASE} | statuslin.es` },
        { name: 'description', content: DESCRIPTION },
        ...(mods.length === 0 ? [{ name: 'robots', content: 'noindex, follow' } as const] : []),
        ...staticPageSocialMeta({ path: MODS_PATH, title: TITLE_BASE, description: DESCRIPTION }),
      ],
      links: [canonicalLink(MODS_PATH)],
      scripts: [
        ...configListPageJsonLd(siteUrl(), { path: MODS_PATH, name: TITLE_BASE }, mods, modPath),
        ...(faq ? [faq] : []),
      ].map(jsonLdScript),
    }
  },
  component: ModsPage,
})

function ModsPage() {
  const { mods, user, origin } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>Best Claude Code mods</Heading>
          <Text muted>
            Plugins that change how Claude Code looks and works, ranked by installs. Each one is
            reviewed before listing, and the install pins the reviewed commit. For status lines, see{' '}
            <TextLink to="/">the gallery</TextLink>.
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
        <FaqSection entries={modsFaq()} />
      </Stack>
    </PageShell>
  )
}
