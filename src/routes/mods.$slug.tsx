import { createFileRoute, notFound } from '@tanstack/react-router'
import { DetailPageLayout } from '@/gallery/detail-page-layout'
import { getSession } from '@/lib/auth-functions'
import { modJsonLd } from '@/lib/breadcrumb-json-ld'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { MOD_NOT_FOUND_TITLE, modMetaDescription, modPageTitle } from '@/lib/page-title'
import { modPath, siteUrl } from '@/lib/site'
import { FootprintSection } from '@/mods/footprint-section'
import { getModDetailFn } from '@/mods/functions'
import { installCommands } from '@/mods/install'
import { InstallCommands } from '@/mods/install-commands'
import { ModHeader } from '@/mods/mod-header'
import { ModPreview } from '@/mods/mod-preview'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { modSocialMeta } from '@/og/meta'
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
    return {
      meta: [
        { title: modPageTitle(mod.title) },
        { name: 'description', content: modMetaDescription(mod.description) },
        ...modSocialMeta(loaderData.origin, mod.slug),
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
  const { mod, user, origin } = Route.useLoaderData()
  const recordCopy = useRecordModCopy(mod.id)

  return (
    <PageShell user={user}>
      <DetailPageLayout
        header={<ModHeader mod={mod} />}
        install={
          <InstallCommands
            commands={installCommands(origin, mod.pluginName)}
            onCopied={recordCopy}
          />
        }
        preview={<ModPreview mod={mod} />}
        detail={{ title: 'What it does', content: <FootprintSection mod={mod} /> }}
        generatedContent={mod.generatedContent}
      />
    </PageShell>
  )
}
