import { createFileRoute, notFound } from '@tanstack/react-router'
import { GeneratedContentSections } from '@/gallery/generated-content'
import { getSession } from '@/lib/auth-functions'
import { modJsonLd } from '@/lib/breadcrumb-json-ld'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { MOD_NOT_FOUND_TITLE, modMetaDescription, modPageTitle } from '@/lib/page-title'
import { modPath, siteUrl } from '@/lib/site'
import { FootprintSection } from '@/mods/footprint-section'
import { getModDetailFn } from '@/mods/functions'
import { installCommands } from '@/mods/install'
import { InstallCommandBlock } from '@/mods/install-command-block'
import { ModHeader } from '@/mods/mod-header'
import { ModPreview } from '@/mods/mod-preview'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { modSocialMeta } from '@/og/meta'
import { Stack } from '@/ui/layout'
import { SectionCard } from '@/ui/section-card'
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
      <Stack gap={6}>
        <ModHeader mod={mod} />

        <SectionCard title="Preview" headingLevel={2}>
          <ModPreview mod={mod} />
        </SectionCard>

        <SectionCard title="Install" headingLevel={2}>
          <Stack gap={4}>
            {installCommands(origin, mod.pluginName).map((command) => (
              <InstallCommandBlock key={command.kind} command={command} onCopied={recordCopy} />
            ))}
          </Stack>
        </SectionCard>

        <SectionCard title="What it does" headingLevel={2}>
          <FootprintSection mod={mod} />
        </SectionCard>

        {mod.generatedContent && <GeneratedContentSections content={mod.generatedContent} />}
      </Stack>
    </PageShell>
  )
}
