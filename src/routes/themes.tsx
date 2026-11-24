import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { PAGE_TITLE_BRAND } from '@/lib/search-text'
import { MODS_PATH, modPath, siteUrl, THEMES_PATH } from '@/lib/site'
import { themesSocialMeta } from '@/og/meta'
import { FilteredThemes } from '@/themes/filtered-themes'
import { getThemeCardsFn, getUnreviewedThemeCardsFn } from '@/themes/functions'
import { PaletteLinks } from '@/themes/palette-links'
import { palettesWithThemes } from '@/themes/palettes'
import { coerceThemeFilter, type ThemeFilter } from '@/themes/theme-filter'
import { themePlugins } from '@/themes/theme-plugins'
import { THEMES_DESCRIPTION, THEMES_HEADING, THEMES_TITLE_BASE } from '@/themes/themes-page'
import { InlineCommand } from '@/ui/inline-command'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/themes')({
  // The filter lives in the URL but not in loaderDeps: the loader returns every theme, and the
  // list filters in the browser.
  validateSearch: (search: Record<string, unknown>): ThemeFilter => coerceThemeFilter(search),
  loader: async () => {
    const [themes, unreviewed, user] = await Promise.all([
      getThemeCardsFn(),
      getUnreviewedThemeCardsFn(),
      getSession(),
    ])
    return { themes, unreviewed, user, origin: siteUrl() }
  },
  // The JSON-LD lists each theme's plugin page, since a theme has no page of its own (ADR 0012).
  // Only reviewed themes count: unreviewed ones are in no list (ADR 0014).
  head: ({ loaderData }) => ({
    meta: [
      { title: `${THEMES_TITLE_BASE}${PAGE_TITLE_BRAND}` },
      { name: 'description', content: THEMES_DESCRIPTION },
      ...((loaderData?.themes ?? []).length === 0
        ? [{ name: 'robots', content: 'noindex, follow' } as const]
        : []),
      ...themesSocialMeta({
        path: THEMES_PATH,
        title: THEMES_TITLE_BASE,
        description: THEMES_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(THEMES_PATH)],
    scripts: configListPageJsonLd(
      siteUrl(),
      { path: THEMES_PATH, name: THEMES_TITLE_BASE },
      themePlugins(loaderData?.themes ?? []),
      modPath,
    ).map(jsonLdScript),
  }),
  component: ThemesPage,
})

function ThemesPage() {
  const { themes, unreviewed, user, origin } = Route.useLoaderData()
  const filter = Route.useSearch()
  const palettes = palettesWithThemes([...themes, ...unreviewed])
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>{THEMES_HEADING}</Heading>
          <Text muted>
            Themes for Claude Code, one card per theme: color themes for the terminal, and Desktop
            themes that recolor Claude Desktop and draw a background behind the chat. Each preview
            is a real session recorded in that theme. A theme comes in a plugin: install the plugin,
            then switch to the theme. Pick a terminal theme in <InlineCommand>/theme</InlineCommand>
            . For a Desktop theme, send the command its card shows, or nothing when its plugin sets
            the theme on its own. Every plugin with an install here is reviewed first, and the
            install is pinned to the reviewed commit. A card says so when its plugin also runs code.
            For plugins that change how Claude Code works, see{' '}
            <TextLink to={MODS_PATH}>mods</TextLink>.
          </Text>
          {palettes.length > 0 ? <PaletteLinks palettes={palettes} /> : null}
        </Stack>
        {themes.length + unreviewed.length > 0 ? (
          <Stack gap={4}>
            <VisuallyHidden as="h2">Themes</VisuallyHidden>
            <FilteredThemes
              themes={themes}
              unreviewed={unreviewed}
              filter={filter}
              origin={origin}
            />
          </Stack>
        ) : (
          <Text muted>No themes yet.</Text>
        )}
      </Stack>
    </PageShell>
  )
}
