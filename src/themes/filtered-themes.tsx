import { useNavigate } from '@tanstack/react-router'
import { THEMES_PATH } from '@/lib/site'
import { Row, Stack, WideTileGrid } from '@/ui/layout'
import { SegmentedControl } from '@/ui/segmented-control'
import { Text, TextLink } from '@/ui/text'
import type { PublishedTheme, UnreviewedTheme } from './queries'
import { THEME_KIND_LABEL, THEME_WINDOW_LABEL, themeCount } from './theme'
import { ThemeCard } from './theme-card'
import { filterThemes, type ThemeFilter, themeFilterOptions } from './theme-filter'
import { UnreviewedThemes } from './unreviewed-themes'

const ALL = 'all'

function FilterControl<T extends string>({
  label,
  values,
  labels,
  value,
  onChange,
}: {
  label: string
  values: T[]
  labels: Record<T, string>
  value: T | undefined
  onChange: (value: T | undefined) => void
}) {
  return (
    <SegmentedControl<T | typeof ALL>
      label={label}
      look="tray"
      options={[
        { label: 'All', value: ALL },
        ...values.map((v) => ({ label: labels[v], value: v })),
      ]}
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    />
  )
}

/**
 * /themes' list under the URL's filter, then its unreviewed themes under the same filter (ADR
 * 0014). Every control writes the URL. The count is of reviewed themes alone.
 */
export function FilteredThemes({
  themes,
  unreviewed,
  filter,
  origin,
}: {
  themes: PublishedTheme[]
  unreviewed: UnreviewedTheme[]
  filter: ThemeFilter
  origin: string
}) {
  const navigate = useNavigate({ from: THEMES_PATH })
  const setFilter = (next: ThemeFilter) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), resetScroll: false })
  const options = themeFilterOptions([...themes, ...unreviewed])
  const shown = filterThemes(themes, filter)
  const shownUnreviewed = filterThemes(unreviewed, filter)
  const filtered = filter.where !== undefined || filter.window !== undefined

  return (
    <Stack gap={4}>
      <Row gap={4} justify="between" wrap>
        <Row gap={4} wrap>
          {options.window ? (
            <FilterControl
              label="Window"
              values={options.window}
              labels={THEME_WINDOW_LABEL}
              value={filter.window}
              onChange={(window) => setFilter({ window })}
            />
          ) : null}
          {options.where ? (
            <FilterControl
              label="Where it applies"
              values={options.where}
              labels={THEME_KIND_LABEL}
              value={filter.where}
              onChange={(where) => setFilter({ where })}
            />
          ) : null}
        </Row>
        <Text size="sm" muted>
          {filtered ? `${shown.length} of ${themeCount(themes.length)}` : themeCount(themes.length)}
        </Text>
      </Row>
      {shown.length > 0 ? (
        <WideTileGrid>
          {shown.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} install={{ origin, surface: 'themes' }} />
          ))}
        </WideTileGrid>
      ) : (
        <Row gap={4} wrap>
          <Text muted>
            {shownUnreviewed.length > 0
              ? 'No reviewed themes match this filter.'
              : 'No themes match this filter.'}
          </Text>
          <TextLink to={THEMES_PATH}>Show all themes</TextLink>
        </Row>
      )}
      <UnreviewedThemes themes={shownUnreviewed} />
    </Stack>
  )
}
