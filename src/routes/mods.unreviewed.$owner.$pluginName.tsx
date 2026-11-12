import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { MOD_NOT_FOUND_TITLE } from '@/lib/page-title'
import { MOD_ROUTE, unreviewedModPath } from '@/lib/site'
import { getUnreviewedModFn } from '@/mods/unreviewed-functions'
import { UnreviewedModPage } from '@/mods/unreviewed-mod-page'
import { unreviewedModMetaDescription, unreviewedModPageTitle } from '@/mods/unreviewed-page-meta'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'
import { Text, TextLink } from '@/ui/text'

export const Route = createFileRoute('/mods/unreviewed/$owner/$pluginName')({
  loader: async ({ params }) => {
    const found = await getUnreviewedModFn({
      data: { owner: params.owner, pluginName: params.pluginName },
    })
    if (!found) throw notFound()
    // Reviewed and published: the listing is the page now (ADR 0011).
    if (found.kind === 'reviewed') {
      throw redirect({ to: MOD_ROUTE, params: { slug: found.slug }, statusCode: 301 })
    }
    return { mod: found.mod, user: await getSession() }
  },
  head: ({ loaderData }) => {
    const mod = loaderData?.mod
    if (!mod) return { meta: [{ title: MOD_NOT_FOUND_TITLE }] }
    const title = unreviewedModPageTitle(mod.pluginName, mod.owner)
    const description = unreviewedModMetaDescription(mod)
    const path = unreviewedModPath(mod.owner, mod.pluginName)
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        ...staticPageSocialMeta({ path, title, description }),
      ],
      links: [canonicalLink(path)],
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>Mod not found.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: UnreviewedModRoute,
})

function UnreviewedModRoute() {
  const { mod, user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <UnreviewedModPage mod={mod} />
    </PageShell>
  )
}
