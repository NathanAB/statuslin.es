import type { CuratedThemeRow } from '@/review/curated-theme-queue'
import { folderUrl } from '@/review/mod-review-card'
import { ThemeReviewList } from '@/review/theme-review-list'
import { Badge } from '@/ui/badge'
import { CodeBlock } from '@/ui/code-block'
import { InlineCommand } from '@/ui/inline-command'
import { Row, Stack } from '@/ui/layout'
import { SectionCard } from '@/ui/section-card'
import { Text, TextLink } from '@/ui/text'

/** The next step for the version: render it, then publish it from the CLI (docs/deploy.md). */
function nextStep({ mod, version, rendered }: CuratedThemeRow) {
  if (!rendered) {
    return { lead: 'Render it on your machine:', command: `bun run render:mods --slug ${mod.slug}` }
  }
  return {
    lead: 'Rendered. Publish it from the CLI, reading the dry run first:',
    command: `bun run scripts/publish-mod.ts ${mod.slug} ${version.commitSha}`,
  }
}

/**
 * A curated plugin whose newest version carries themes, before it goes live: each theme's preview
 * and exact file, and the command to run next. No approve button: publish-mod.ts publishes it.
 */
export function CuratedThemeCard({ row }: { row: CuratedThemeRow }) {
  const { mod, version } = row
  const step = nextStep(row)
  return (
    <SectionCard title={mod.title}>
      <Stack gap={4}>
        <Row gap={2} align="center" wrap>
          <Badge variant="outline">Curated</Badge>
          <Badge variant="secondary">
            {mod.status === 'draft' ? 'First publish' : `Update to ${mod.slug}`}
          </Badge>
          <Text muted size="sm">
            {`v${version.versionNumber} by ${mod.authorGithub}`}
          </Text>
        </Row>
        <TextLink href={folderUrl(version)}>
          {`${version.commitSha.slice(0, 12)}${version.path ? ` · ${version.path}` : ''}`}
        </TextLink>
        <Stack gap={1.5}>
          <Text muted size="sm">
            {step.lead}
          </Text>
          <CodeBlock compact wrap text={step.command} copyLabel="Copy command">
            {step.command}
          </CodeBlock>
          {row.rendered ? (
            <Text muted size="sm">
              Then run it again with{' '}
              <InlineCommand>{`--apply --confirm=${mod.slug}`}</InlineCommand>.
            </Text>
          ) : null}
        </Stack>
        <ThemeReviewList themes={row.themes} />
      </Stack>
    </SectionCard>
  )
}
