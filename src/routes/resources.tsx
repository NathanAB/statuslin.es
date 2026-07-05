import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript, resourcesJsonLd } from '@/lib/json-ld'
import { RESOURCES_TITLE_BASE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { RESOURCE_SECTIONS } from '@/resources/data'
import { ResourcesContent } from '@/resources/resources-content'
import { PageShell } from '@/ui/shell'

const DESCRIPTION =
  'The Claude Code status line tools, generators, and guides worth knowing about, picked by hand. Plus a gallery of rendered status lines you can copy.'

export const Route = createFileRoute('/resources')({
  loader: () => getSession(),
  head: () => ({
    meta: [
      { title: `${RESOURCES_TITLE_BASE} | statuslin.es` },
      { name: 'description', content: DESCRIPTION },
      ...staticPageSocialMeta({
        path: '/resources',
        title: RESOURCES_TITLE_BASE,
        description: DESCRIPTION,
      }),
    ],
    links: [canonicalLink('/resources')],
    scripts: [
      jsonLdScript(
        resourcesJsonLd(
          siteUrl(),
          RESOURCE_SECTIONS.flatMap((s) => s.resources.map((r) => ({ name: r.name, url: r.url }))),
        ),
      ),
    ],
  }),
  component: Resources,
})

function Resources() {
  const user = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <ResourcesContent />
    </PageShell>
  )
}
