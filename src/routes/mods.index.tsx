import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { faqPageJsonLd, jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { MODS_PATH, modPath, siteUrl } from '@/lib/site'
import { getGalleryModsFn } from '@/mods/gallery-functions'
import { ModCard } from '@/mods/mod-card'
import { MODS_FAQ } from '@/mods/mods-page-faq'
import { staticPageSocialMeta } from '@/og/meta'
import { FaqSection } from '@/ui/faq-section'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

const TITLE_BASE = 'Claude Code Mods with Real Previews'
const DESCRIPTION =
  'Claude Code mods with real previews from the terminal and Claude Desktop. See what each one can touch, then install it at the commit a person reviewed.'

export const Route = createFileRoute('/mods/')({
  loader: async () => {
    const [mods, user] = await Promise.all([
      getGalleryModsFn({ data: { sort: 'top' } }),
      getSession(),
    ])
    return {
      mods: mods.items.flatMap(({ item }) => (item.kind === 'mod' ? [item.card] : [])),
      user,
    }
  },
  head: ({ loaderData }) => {
    const mods = loaderData?.mods ?? []
    const faq = faqPageJsonLd(MODS_FAQ)
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
  const { mods, user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>Claude Code mods</Heading>
          <Text muted>
            Mods are Claude Code plugins that draw in its interface: above the prompt, under it, or
            in a pane.
          </Text>
          <Text muted>
            Every preview here comes from running the mod in Claude Code. A person reviewed each
            one, and its install is pinned to the commit they read.
          </Text>
          <Text muted>
            Looking for a status line instead? <TextLink to="/">Browse the gallery</TextLink>.
          </Text>
        </Stack>
        {mods.length > 0 ? (
          <Stack gap={4}>
            <VisuallyHidden as="h2">Mods</VisuallyHidden>
            {mods.map((card) => (
              <ModCard key={card.slug} card={card} />
            ))}
          </Stack>
        ) : (
          <Text muted>No mods are published yet.</Text>
        )}
        <FaqSection entries={MODS_FAQ} />
      </Stack>
    </PageShell>
  )
}
