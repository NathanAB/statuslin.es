import { usePostHog } from '@posthog/react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DetailPageLayout } from '@/gallery/detail-page-layout'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { withoutInlineCode } from '@/lib/inline-code'
import { jsonLdScript } from '@/lib/json-ld'
import {
  MOD_NOT_FOUND_TITLE,
  MOD_SAFETY_GUIDE_PATH,
  modMetaDescription,
  modPageTitle,
} from '@/lib/page-title'
import { modPath, siteUrl } from '@/lib/site'
import { getModDetailFn } from '@/mods/functions'
import { ModInstallPrompt } from '@/mods/install-prompt'
import { modJsonLd } from '@/mods/json-ld'
import { MarketplaceLine } from '@/mods/marketplace-line'
import { modFactTiles } from '@/mods/mod-fact-tiles'
import { ModHeader } from '@/mods/mod-header'
import { modInstallFacts } from '@/mods/mod-install-facts'
import { ModPreview } from '@/mods/mod-preview'
import { ModRelated } from '@/mods/mod-related'
import type { ModDetail } from '@/mods/queries'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { modSocialMeta } from '@/og/meta'
import { InstallFacts } from '@/ui/install-facts'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Text, TextLink } from '@/ui/text'

/** Below this, an author's description says too little for a search snippet. */
const MIN_DESCRIPTION_CHARS = 60

/**
 * The author's description, or the reviewed page summary when the author's is short. The summary
 * marks code with backticks for the page, so they're dropped here: snippets show plain text.
 */
function searchDescription(mod: Pick<ModDetail, 'description' | 'generatedContent'>): string {
  const summary = mod.generatedContent?.summary
  return summary && mod.description.trim().length < MIN_DESCRIPTION_CHARS
    ? withoutInlineCode(summary)
    : mod.description
}

export const Route = createFileRoute('/mods/$slug')({
  loader: async ({ params }) => {
    const mod = await getModDetailFn({ data: { slug: params.slug } })
    if (!mod) throw notFound()
    return { mod, user: await getSession(), origin: siteUrl() }
  },
  head: ({ loaderData }) => {
    const mod = loaderData?.mod
    if (!mod) return { meta: [{ title: MOD_NOT_FOUND_TITLE }] }
    return {
      meta: [
        { title: modPageTitle(mod.title) },
        { name: 'description', content: modMetaDescription(searchDescription(mod)) },
        ...modSocialMeta(loaderData.origin, { ...mod, description: searchDescription(mod) }),
      ],
      links: [canonicalLink(modPath(mod.slug))],
      scripts: modJsonLd(loaderData.origin, mod).map(jsonLdScript),
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>Mod not found.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: ModPage,
})

function ModPage() {
  const posthog = usePostHog()
  const { mod, user, origin } = Route.useLoaderData()
  const copyController = useRecordModCopy(mod.id, mod.copyCount)

  useEffect(() => {
    posthog.capture('mod_detail_viewed', { modId: mod.id, slug: mod.slug })
  }, [posthog, mod.id, mod.slug])

  return (
    <PageShell user={user}>
      <DetailPageLayout
        header={<ModHeader mod={mod} />}
        beforeInstall={
          <InstallFacts
            heading="What this mod can do"
            facts={modInstallFacts(mod)}
            link={{ label: 'Are mods safe?', to: MOD_SAFETY_GUIDE_PATH }}
          />
        }
        install={
          <Stack gap={4}>
            <ModInstallPrompt
              origin={origin}
              slug={mod.slug}
              title={mod.title}
              controller={copyController}
            />
            <MarketplaceLine origin={origin} />
          </Stack>
        }
        preview={<ModPreview mod={mod} />}
        whatItDoes={{ copy: mod.generatedContent, tiles: modFactTiles(mod) }}
        related={<ModRelated items={mod.related} />}
      />
    </PageShell>
  )
}
