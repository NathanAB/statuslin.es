import type { ReviewTheme } from '@/review/theme-review'
import type { ThemeWindow } from '@/themes/theme'
import { CodeBlock } from '@/ui/code-block'
import { Details } from '@/ui/details'
import { Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import { ThemePreview } from '@/ui/theme-preview'

const WINDOW_LABEL: Record<ThemeWindow, string> = {
  light: 'Light window',
  dark: 'Dark window',
}

/** One theme: its preview above the exact file it was recorded from, folded under its name. */
function ThemeReview({ theme }: { theme: ReviewTheme }) {
  return (
    <Details summary={theme.name}>
      <Stack gap={3}>
        <Text muted size="xs">
          {WINDOW_LABEL[theme.window]}
        </Text>
        {theme.preview === null ? (
          <Text muted size="sm">
            Not rendered yet.
          </Text>
        ) : (
          <ThemePreview
            segments={theme.preview}
            window={theme.window}
            label={`${theme.name} preview`}
          />
        )}
        <Stack gap={1.5}>
          <Text muted size="xs" mono>
            {`themes/${theme.key}.json`}
          </Text>
          <CodeBlock compact text={theme.source} copyLabel="Copy theme file">
            {theme.source}
          </CodeBlock>
        </Stack>
      </Stack>
    </Details>
  )
}

/** Every theme a version carries, each folded so a pack of 81 stays a list of names. */
export function ThemeReviewList({ themes }: { themes: ReviewTheme[] }) {
  if (themes.length === 0) return null
  return (
    <Stack gap={2}>
      <Text muted size="xs">{`Themes (${themes.length})`}</Text>
      {themes.map((theme) => (
        <ThemeReview key={theme.id} theme={theme} />
      ))}
    </Stack>
  )
}
