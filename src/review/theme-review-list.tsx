import type { ReviewTheme, ThemeChange } from '@/review/theme-review'
import { TERMINAL_COLORS_NOTICE, type ThemeWindow } from '@/themes/theme'
import { CodeBlock } from '@/ui/code-block'
import { DesktopShot } from '@/ui/desktop-shot'
import { Details } from '@/ui/details'
import { Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import { ThemePreview } from '@/ui/theme-preview'

const WINDOW_LABEL: Record<ThemeWindow, string> = {
  light: 'Light window',
  dark: 'Dark window',
}

function TerminalThemeReview({ theme }: { theme: Extract<ReviewTheme, { kind: 'terminal' }> }) {
  return (
    <>
      <Text muted size="xs">
        {WINDOW_LABEL[theme.window]}
      </Text>
      {theme.usesTerminalColors ? (
        <Text muted size="xs">
          {TERMINAL_COLORS_NOTICE}
        </Text>
      ) : null}
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
    </>
  )
}

function DesktopThemeReview({ theme }: { theme: Extract<ReviewTheme, { kind: 'desktop' }> }) {
  const steps = theme.switchSteps.join('\n')
  return (
    <>
      <Text muted size="xs">
        {`Claude Desktop, ${theme.window} window`}
      </Text>
      {theme.preview === null ? (
        <Text muted size="sm">
          Not rendered yet.
        </Text>
      ) : (
        <DesktopShot shot={theme.preview} alt={`${theme.name} preview`} fit="whole" />
      )}
      {theme.switchSteps.length === 0 ? (
        <Text muted size="sm">
          No switch steps: the mod sets it when a session starts.
        </Text>
      ) : (
        <Stack gap={1.5}>
          <Text muted size="xs">
            Switch steps
          </Text>
          <CodeBlock compact text={steps} copyLabel="Copy switch steps">
            {steps}
          </CodeBlock>
        </Stack>
      )}
    </>
  )
}

const CHANGE_LABEL: Record<ThemeChange, string> = {
  new: 'New since live',
  changed: 'Changed since live',
}

function ThemeReview({ theme }: { theme: ReviewTheme }) {
  const summary =
    theme.change === null ? theme.name : `${CHANGE_LABEL[theme.change]}: ${theme.name}`
  return (
    <Details summary={summary}>
      <Stack gap={3}>
        {theme.kind === 'terminal' ? (
          <TerminalThemeReview theme={theme} />
        ) : (
          <DesktopThemeReview theme={theme} />
        )}
      </Stack>
    </Details>
  )
}

/**
 * Every theme a version carries, each folded so a pack of 81 stays a list of names. On an update, the
 * themes new or changed since the live version come first, marked, so one changed theme in 200 is
 * the first thing the operator reads.
 */
export function ThemeReviewList({ themes }: { themes: ReviewTheme[] }) {
  if (themes.length === 0) return null
  const marked = themes.filter((theme) => theme.change !== null)
  const ordered = [...marked, ...themes.filter((theme) => theme.change === null)]
  const count =
    marked.length === 0
      ? `${themes.length}`
      : `${themes.length}, ${marked.length} new or changed since the live version`
  return (
    <Stack gap={2}>
      <Text muted size="xs">{`Themes (${count})`}</Text>
      {ordered.map((theme) => (
        <ThemeReview key={theme.id} theme={theme} />
      ))}
    </Stack>
  )
}
