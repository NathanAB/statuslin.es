import { Puzzle } from 'lucide-react'
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
import { Heading, Text, TextLink } from '@/ui/text'
import { ThemePreview } from '@/ui/theme-preview'
import { VisuallyHidden } from '@/ui/visually-hidden'
import type { PublishedTheme } from './queries'
import { THEME_WINDOW_LABEL } from './theme'

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

/**
 * One theme: its preview in its window, its name, and how to switch to it. The name is the one its
 * preview was recorded in, and the author's text, so it is shown only as text. With `install` it
 * also names its plugin and how to install it, as on /themes and the home page; its plugin's own
 * page leaves that to the page.
 */
export function ThemeCard({
  theme,
  install,
}: {
  theme: PublishedTheme
  install?: ThemeCardInstall
}) {
  return (
    <Card>
      <CardContent>
        <Stack gap={3}>
          <ThemePreview
            segments={theme.preview}
            window={theme.window}
            label={`${theme.name} preview`}
          />
          <Row gap={2} justify="between">
            <Heading level={3}>{theme.name}</Heading>
            <Badge variant="outline">{THEME_WINDOW_LABEL[theme.window]}</Badge>
          </Row>
          {install === undefined ? null : <PluginInstall plugin={theme.plugin} install={install} />}
          <Text size="sm" muted>
            Start a new session, run <InlineCommand>/theme</InlineCommand> and pick{' '}
            <Text inline>{theme.name}</Text>.
          </Text>
        </Stack>
      </CardContent>
    </Card>
  )
}
