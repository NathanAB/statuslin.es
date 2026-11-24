import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { PAGE_TITLE_BRAND } from '@/lib/search-text'
import { MODS_PATH, siteUrl, THEMES_PATH } from '@/lib/site'
import { themesSocialMeta } from '@/og/meta'
import { FilteredThemes } from '@/themes/filtered-themes'
import { getThemeCardsFn } from '@/themes/functions'
import { coerceThemeFilter, type ThemeFilter } from '@/themes/theme-filter'
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
    const [themes, user] = await Promise.all([getThemeCardsFn(), getSession()])
    return { themes, user, origin: siteUrl() }
  },
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
  }),
  component: ThemesPage,
})

function ThemesPage() {
  const { themes, user, origin } = Route.useLoaderData()
  const filter = Route.useSearch()
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
            the theme on its own. Every plugin is reviewed before it goes live, and the install is
            pinned to the reviewed commit. A card says so when its plugin also runs code. For
            plugins that change how Claude Code works, see <TextLink to={MODS_PATH}>mods</TextLink>.
          </Text>
        </Stack>
        {themes.length > 0 ? (
          <Stack gap={4}>
            <VisuallyHidden as="h2">Themes</VisuallyHidden>
            <FilteredThemes themes={themes} filter={filter} origin={origin} />
          </Stack>
        ) : (
          <Text muted>No themes yet.</Text>
        )}
      </Stack>
    </PageShell>
  )
}
