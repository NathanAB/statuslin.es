import { useNavigate } from '@tanstack/react-router'
import { THEMES_PATH } from '@/lib/site'
import { Row, Stack, WideTileGrid } from '@/ui/layout'
import { SegmentedControl } from '@/ui/segmented-control'
import { Text, TextLink } from '@/ui/text'
import type { PublishedTheme } from './queries'
import { THEME_KIND_LABEL, THEME_WINDOW_LABEL } from './theme'
import { ThemeCard } from './theme-card'
import { filterThemes, type ThemeFilter, themeFilterOptions } from './theme-filter'

const ALL = 'all'

/** One filter's control: All, then each value the listed themes span. */
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

const themeCount = (count: number) => `${count} ${count === 1 ? 'theme' : 'themes'}`

/**
 * /themes' list under the URL's filter: a control per filter the themes span, how many show, and
 * a card each. Every control writes the URL; the list filters in the browser, loading nothing.
 */
export function FilteredThemes({
  themes,
  filter,
  origin,
}: {
  themes: PublishedTheme[]
  filter: ThemeFilter
  origin: string
}) {
  const navigate = useNavigate({ from: THEMES_PATH })
  const setFilter = (next: ThemeFilter) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), resetScroll: false })
  const options = themeFilterOptions(themes)
  const shown = filterThemes(themes, filter)
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
            <ThemeCard key={theme.id} theme={theme} installFrom={origin} />
          ))}
        </WideTileGrid>
      ) : (
        <Row gap={4} wrap>
          <Text muted>No themes match this filter.</Text>
          <TextLink to={THEMES_PATH}>Show all themes</TextLink>
        </Row>
      )}
    </Stack>
  )
}
