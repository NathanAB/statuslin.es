import { createFileRoute, notFound } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { breadcrumbJsonLd, HOME_CRUMB_NAME, THEMES_CRUMB } from '@/lib/breadcrumb-json-ld'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { NOT_FOUND_TITLE } from '@/lib/page-title'
import { brandedPageTitle } from '@/lib/search-text'
import { modPath, palettePath, siteUrl, THEMES_PATH } from '@/lib/site'
import { paletteSocialMeta } from '@/og/meta'
import { getPaletteThemesFn } from '@/themes/functions'
import { PaletteLinks } from '@/themes/palette-links'
import { type Palette, palettePageCopy } from '@/themes/palettes'
import type { PublishedTheme } from '@/themes/queries'
import { ThemeCard } from '@/themes/theme-card'
import { themePlugins } from '@/themes/theme-plugins'
import { UnreviewedThemes } from '@/themes/unreviewed-themes'
import { InlineCommand } from '@/ui/inline-command'
import { Stack, WideTileGrid } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

// `themes_` keeps this page out of /themes' route: it's a sibling page, not a child.
export const Route = createFileRoute('/themes_/$palette')({
  loader: async ({ params }) => {
    const [page, user] = await Promise.all([
      getPaletteThemesFn({ data: params.palette }),
      getSession(),
    ])
    if (!page) throw notFound()
    return { ...page, user, origin: siteUrl() }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: NOT_FOUND_TITLE }] }
    const { palette, themes, unreviewed, origin } = loaderData
    const copy = palettePageCopy(palette, themes, unreviewed)
    const path = palettePath(palette.slug)
    // The list's own BreadcrumbList stops at the page; this page's runs through Themes. A page of
    // unreviewed themes alone lists no plugin (ADR 0014).
    const collection =
      themes.length === 0
        ? []
        : configListPageJsonLd(
            origin,
            { path, name: copy.title },
            themePlugins(themes),
            modPath,
          ).slice(0, 1)
    return {
      meta: [
        { title: brandedPageTitle(copy.title) },
        { name: 'description', content: copy.description },
        ...paletteSocialMeta({
          path,
          title: copy.title,
          description: copy.description,
          palette: palette.slug,
        }),
      ],
      links: [canonicalLink(path)],
      scripts: [
        ...collection,
        breadcrumbJsonLd([
          { name: HOME_CRUMB_NAME, item: origin },
          { name: THEMES_CRUMB.name, item: `${origin}${THEMES_PATH}` },
          { name: palette.name, item: `${origin}${path}` },
        ]),
      ].map(jsonLdScript),
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>No themes of that palette yet.</Text>
      <TextLink to={THEMES_PATH}>See every theme</TextLink>
    </PageShell>
  ),
  component: PalettePage,
})

function PalettePage() {
  const { palette, themes, unreviewed, palettes, user, origin } = Route.useLoaderData()
  const copy = palettePageCopy(palette, themes, unreviewed)
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>{copy.heading}</Heading>
          {themes.length > 0 ? (
            <ReviewedIntro palette={palette} themes={themes} />
          ) : (
            <Text muted>
              {palette.name} themes, each previewed in a real session. Nobody at statuslin.es has
              read these plugins' code yet, so none can be installed from here.{' '}
              <TextLink to={THEMES_PATH}>See every theme</TextLink>.
            </Text>
          )}
          <PaletteLinks palettes={palettes} current={palette.slug} />
        </Stack>
        {themes.length > 0 ? (
          <Stack gap={4}>
            <VisuallyHidden as="h2">{palette.name} themes</VisuallyHidden>
            <WideTileGrid>
              {themes.map((theme) => (
                <ThemeCard key={theme.id} theme={theme} install={{ origin, surface: 'themes' }} />
              ))}
            </WideTileGrid>
          </Stack>
        ) : null}
        <UnreviewedThemes themes={unreviewed} />
      </Stack>
    </PageShell>
  )
}

function ReviewedIntro({ palette, themes }: { palette: Palette; themes: PublishedTheme[] }) {
  const terminal = themes.some((theme) => theme.kind === 'terminal')
  const desktop = themes.some((theme) => theme.kind === 'desktop')
  return (
    <Text muted>
      Every reviewed {palette.name} theme statuslin.es lists, each previewed in a real session. A
      theme comes in a plugin: install the plugin, then switch to the theme.
      {terminal ? (
        <>
          {' '}
          Pick a terminal theme in <InlineCommand>/theme</InlineCommand>.
        </>
      ) : null}
      {desktop
        ? ' For a Desktop theme, send the command its card shows, or nothing when its plugin sets the theme on its own.'
        : null}{' '}
      Every plugin with an install here is reviewed first, and the install is pinned to the reviewed
      commit. <TextLink to={THEMES_PATH}>See every theme</TextLink>.
    </Text>
  )
}
