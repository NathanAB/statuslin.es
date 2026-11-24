import { Palette, Puzzle } from 'lucide-react'
import type { ModFootprint } from '@/db/schema'
import type { CopySurface } from '@/lib/copy-surface'
import { modInstallCommands } from '@/mods/install'
import { modAuthor } from '@/mods/mod-author'
import { modReachSentence } from '@/mods/mod-install-facts'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { AuthorChip } from '@/ui/author-chip'
import { Badge } from '@/ui/badge'
import { Card, CardContent } from '@/ui/card'
import { CodeBlock } from '@/ui/code-block'
import { Hint } from '@/ui/hint'
import { InlineCommand } from '@/ui/inline-command'
import { Row, Stack } from '@/ui/layout'
import { SectionAnchor } from '@/ui/page-section'
import { Heading, Text, TextLink } from '@/ui/text'
import { DesktopThemePreview, ThemePreview } from '@/ui/theme-preview'
import { VisuallyHidden } from '@/ui/visually-hidden'
import { themeAnchor } from './palettes'
import type { PublishedTheme, UnreviewedTheme } from './queries'
import { TERMINAL_COLORS_NOTICE, THEME_KIND_LABEL, THEME_WINDOW_LABEL } from './theme'

type ThemePlugin = PublishedTheme['plugin']

/**
 * Before the install of a plugin that is more than its theme files: that it runs code, what its
 * hooks modules can reach, and its page, which lists everything it can do.
 */
function RunsCodeNotice({ plugin, footprint }: { plugin: ThemePlugin; footprint: ModFootprint }) {
  const reach = modReachSentence(footprint)
  return (
    <Hint
      icon={Puzzle}
      action={
        <TextLink to="/mods/$slug" params={{ slug: plugin.slug }}>
          See what it can do<VisuallyHidden>: {plugin.title}</VisuallyHidden>
        </TextLink>
      }
    >
      <Text inline>Also runs code.</Text>
      {reach ? ` ${reach.text}.` : null}
    </Hint>
  )
}

/** Where a card offers its plugin's install: the site's origin, and the surface a copy counts from. */
export interface ThemeCardInstall {
  origin: string
  surface: CopySurface
}

/**
 * The plugin a theme comes from, who made it, and the command that installs it from this site. A
 * copy counts as an install of the plugin, as on its own page; the card shows no count.
 */
function PluginInstall({ plugin, install }: { plugin: ThemePlugin; install: ThemeCardInstall }) {
  const command = modInstallCommands(install.origin, plugin.slug).join(' && ')
  const { record } = useRecordModCopy(plugin.id, 0, install.surface)
  return (
    <Stack gap={2}>
      <Row gap={2} wrap>
        <Text size="sm" inline>
          From{' '}
          <TextLink to="/mods/$slug" params={{ slug: plugin.slug }}>
            {plugin.title}
          </TextLink>
        </Text>
        <AuthorChip author={modAuthor(plugin.authorGithub)} />
      </Row>
      {plugin.code ? <RunsCodeNotice plugin={plugin} footprint={plugin.code.footprint} /> : null}
      <CodeBlock
        compact
        wrap
        text={command}
        copyLabel={`Copy install command for ${plugin.title}`}
        onCopied={() => record('prompt')}
      >
        {command}
      </CodeBlock>
    </Stack>
  )
}

/** A theme's recorded preview in its window, on a reviewed or an unreviewed card. */
export function ThemeLook({ theme }: { theme: PublishedTheme | UnreviewedTheme }) {
  const label = `${theme.name} preview`
  if (theme.kind === 'terminal') {
    return <ThemePreview segments={theme.preview} window={theme.window} label={label} />
  }
  return (
    <DesktopThemePreview
      card={theme.preview.card}
      fullSize={theme.preview.shot.src}
      label={label}
    />
  )
}

function Steps({ steps }: { steps: string[] }) {
  return steps.map((step, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a stored list that never reorders and may repeat a step.
    <Text key={i} inline>
      {i > 0 ? ', then ' : null}
      <InlineCommand>{step}</InlineCommand>
    </Text>
  ))
}

function SwitchTo({ theme }: { theme: PublishedTheme }) {
  if (theme.kind === 'terminal') {
    return (
      <Text size="sm" muted>
        Start a new session, run <InlineCommand>/theme</InlineCommand> and pick{' '}
        <Text inline>{theme.name}</Text>.
      </Text>
    )
  }
  if (theme.switchSteps.length === 0) {
    return (
      <Text size="sm" muted>
        In Claude Desktop, start a new session: the plugin sets <Text inline>{theme.name}</Text> on
        its own.
      </Text>
    )
  }
  return (
    <Text size="sm" muted>
      In Claude Desktop, start a new session and send <Steps steps={theme.switchSteps} />.
    </Text>
  )
}

/**
 * One theme: its preview in its window, its name, and how to switch to it. The name is the one its
 * preview was recorded in, and the author's text, so it is shown only as text. The name links to
 * the card itself, so a shared link opens the page at it. With `install` it also names its plugin
 * and how to install it; its plugin's own page leaves that to the page.
 */
export function ThemeCard({
  theme,
  install,
}: {
  theme: PublishedTheme
  install?: ThemeCardInstall
}) {
  const anchor = themeAnchor(theme)
  return (
    <SectionAnchor id={anchor}>
      <Card>
        <CardContent>
          <Stack gap={3}>
            <ThemeLook theme={theme} />
            <Row gap={2} justify="between">
              <Heading level={3}>
                <TextLink href={`#${anchor}`} tone="plain">
                  {theme.name}
                </TextLink>
              </Heading>
              <Row gap={2}>
                <Badge variant="outline">{THEME_KIND_LABEL[theme.kind]}</Badge>
                <Badge variant="outline">{THEME_WINDOW_LABEL[theme.window]}</Badge>
              </Row>
            </Row>
            {theme.kind === 'terminal' && theme.usesTerminalColors ? (
              <Hint icon={Palette}>{TERMINAL_COLORS_NOTICE}</Hint>
            ) : null}
            {install === undefined ? null : (
              <PluginInstall plugin={theme.plugin} install={install} />
            )}
            <SwitchTo theme={theme} />
          </Stack>
        </CardContent>
      </Card>
    </SectionAnchor>
  )
}
