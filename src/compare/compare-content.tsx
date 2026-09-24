import type { ComparePage } from '@/compare/pages'
import { FACT_ROWS, type ThirdPartyTool } from '@/compare/tools'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { BulletList } from '@/ui/bullet-list'
import { Grid, Row, Stack } from '@/ui/layout'
import { MetaList } from '@/ui/meta-list'
import { SectionCard } from '@/ui/section-card'
import { Heading, Text, TextLink } from '@/ui/text'

export function CompareContent({ page }: { page: ComparePage }) {
  return (
    <Stack gap={9}>
      <Stack gap={3}>
        <Heading level={1}>{page.heading}</Heading>
        {page.intro.map((paragraph) => (
          <Text key={paragraph.slice(0, 32)} muted measure>
            {paragraph}
          </Text>
        ))}
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>At a glance</Heading>
        <Grid>
          {page.tools.map((tool) => (
            <ToolFacts key={tool.slug} tool={tool} />
          ))}
        </Grid>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>When to pick which</Heading>
        <BulletList items={page.picks.map((pick) => pick.text)} />
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Status lines that do the same job</Heading>
        <RankedCardList items={page.cards} surface="compare" />
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Keep comparing</Heading>
        <Row gap={4} wrap>
          {page.links.map((link) =>
            link.to === '/compare/$pair' ? (
              <TextLink key={link.label} to={link.to} params={link.params}>
                {link.label}
              </TextLink>
            ) : (
              <TextLink key={link.label} to={link.to} params={link.params}>
                {link.label}
              </TextLink>
            ),
          )}
          <TextLink to="/status-lines/best">Most-copied status lines</TextLink>
          <TextLink to="/resources">All status line tools</TextLink>
        </Row>
      </Stack>
    </Stack>
  )
}

function ToolFacts({ tool }: { tool: ThirdPartyTool }) {
  return (
    <SectionCard title={<TextLink href={tool.repoUrl}>{tool.name}</TextLink>}>
      <Stack gap={3}>
        <MetaList
          items={FACT_ROWS.map((row) => ({ label: row.label, value: tool.facts[row.key] }))}
        />
        <Text muted size="xs">
          Checked against the <TextLink href={tool.sources[0] ?? tool.repoUrl}>README</TextLink> on{' '}
          {tool.verifiedAt}.
        </Text>
      </Stack>
    </SectionCard>
  )
}
