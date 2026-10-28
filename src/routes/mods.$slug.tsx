import { usePostHog } from '@posthog/react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DetailPageLayout } from '@/gallery/detail-page-layout'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import {
  MOD_NOT_FOUND_TITLE,
  MOD_SAFETY_GUIDE_PATH,
  modMetaDescription,
  modPageTitle,
} from '@/lib/page-title'
import { searchDescription } from '@/lib/search-description'
import { modPath, siteUrl } from '@/lib/site'
import { getModDetailFn } from '@/mods/functions'
import { ModInstallPrompt } from '@/mods/install-prompt'
import { modJsonLd } from '@/mods/json-ld'
import { modFactTiles } from '@/mods/mod-fact-tiles'
import { ModHeader } from '@/mods/mod-header'
import { modInstallFacts } from '@/mods/mod-install-facts'
import { ModPreview } from '@/mods/mod-preview'
import { ModRelated } from '@/mods/mod-related'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { modSocialMeta } from '@/og/meta'
import { FaqSection } from '@/ui/faq-section'
import { InstallFacts } from '@/ui/install-facts'
import { PageShell } from '@/ui/shell'
import { Text, TextLink } from '@/ui/text'

export const Route = createFileRoute('/mods/$slug')({
  loader: async ({ params }) => {
    const mod = await getModDetailFn({ data: { slug: params.slug } })
    if (!mod) throw notFound()
    return { mod, user: await getSession(), origin: siteUrl() }
  },
  head: ({ loaderData }) => {
    const mod = loaderData?.mod
    if (!mod) return { meta: [{ title: MOD_NOT_FOUND_TITLE }] }
    const headline = mod.generatedContent?.headline
    return {
      meta: [
        { title: modPageTitle(mod.title, headline) },
        {
          name: 'description',
          content: modMetaDescription(searchDescription(mod.description, mod.generatedContent)),
        },
        ...modSocialMeta(loaderData.origin, {
          ...mod,
          headline,
          description: searchDescription(mod.description, mod.generatedContent),
        }),
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
  const faq = mod.generatedContent?.faq ?? []

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
            {...modInstallFacts(mod)}
            link={{ label: 'Are mods safe?', to: MOD_SAFETY_GUIDE_PATH }}
          />
        }
        install={
          <ModInstallPrompt
            origin={origin}
            slug={mod.slug}
            title={mod.title}
            controller={copyController}
          />
        }
        preview={<ModPreview mod={mod} />}
        whatItDoes={{ copy: mod.generatedContent, tiles: modFactTiles(mod) }}
        faq={faq.length > 0 ? <FaqSection entries={faq} /> : undefined}
        related={<ModRelated items={mod.related} />}
      />
    </PageShell>
  )
}
