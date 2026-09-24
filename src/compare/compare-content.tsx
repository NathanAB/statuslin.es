import { Fragment } from 'react'
import type { ComparePage, FactSheet } from '@/compare/pages'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { BulletList } from '@/ui/bullet-list'
import { FactTable } from '@/ui/fact-table'
import { Row, Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

export function CompareContent({ page }: { page: ComparePage }) {
  return (
    <Stack gap={9}>
      <Stack gap={3}>
        <Heading level={1}>{page.heading}</Heading>
        <Text muted measure>
          {page.intro}
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>At a glance</Heading>
        <Facts facts={page.facts} />
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Which to pick</Heading>
        <BulletList items={page.picks} />
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

function Facts({ facts }: { facts: FactSheet }) {
  return (
    <Stack gap={2}>
      <FactTable
        columns={facts.columns.map((c) => (
          <TextLink key={c.name} href={c.repoUrl}>
            {c.name}
          </TextLink>
        ))}
        rows={facts.rows}
      />
      <Text muted size="xs">
        Checked against the{' '}
        {facts.columns.map((c, i) => (
          <Fragment key={c.name}>
            {i > 0 && ' and '}
            <TextLink href={c.sourceUrl}>{c.name}</TextLink>
          </Fragment>
        ))}{' '}
        {facts.columns.length > 1 ? 'READMEs' : 'README'} on {facts.checkedOn}.
      </Text>
    </Stack>
  )
}
