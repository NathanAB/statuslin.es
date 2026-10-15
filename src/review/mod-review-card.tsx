import type { ReactNode } from 'react'
import { ApprovalDetails } from '@/review/dashboard-approval-details'
import {
  type BadgeVariant,
  PUBLISHED_HEADLINE,
  READY_HEADLINE,
} from '@/review/dashboard-card-parts'
import { ReviewDecisionControls } from '@/review/dashboard-rejection-controls'
import { RejectionDetails } from '@/review/dashboard-rejection-details'
import type { ModReviewRow, ModReviewVersion } from '@/review/mod-queue'
import { AnalyticsPrivate } from '@/ui/analytics-private'
import { AuthorChip } from '@/ui/author-chip'
import { Badge } from '@/ui/badge'
import { Callout } from '@/ui/callout'
import { CodeBlock } from '@/ui/code-block'
import { DesktopShot } from '@/ui/desktop-shot'
import { Row, Stack } from '@/ui/layout'
import { LocalTime } from '@/ui/local-time'
import { MetaList } from '@/ui/meta-list'
import { SectionCard } from '@/ui/section-card'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text, TextLink } from '@/ui/text'

/** The mod's folder on GitHub at the version's commit. */
function folderUrl(v: Pick<ModReviewVersion, 'repoUrl' | 'path' | 'commitSha'>): string {
  const tree = `${v.repoUrl}/tree/${v.commitSha}`
  return v.path === '' ? tree : `${tree}/${v.path}`
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={1.5}>
      <Text muted size="xs">
        {label}
      </Text>
      {children}
    </Stack>
  )
}

const muted = (text: string) => (
  <Text muted size="sm">
    {text}
  </Text>
)

function Previews({ row }: { row: ModReviewRow }) {
  const { preview, desktop } = row
  return (
    <Stack gap={3}>
      <Labelled label="Terminal">
        {preview === null ? (
          muted('Not rendered yet.')
        ) : preview.length > 0 ? (
          <StatuslinePreview segments={preview} />
        ) : (
          muted('Draws nothing in the terminal.')
        )}
      </Labelled>
      <Labelled label="Claude Desktop">
        {desktop === null ? (
          muted('Not rendered yet.')
        ) : desktop.kind === 'shot' ? (
          <DesktopShot shot={desktop} alt={`${row.mod.title} in Claude Desktop`} fit="whole" />
        ) : (
          muted('Draws nothing in Claude Desktop.')
        )}
      </Labelled>
    </Stack>
  )
}

function Footprint({ label, entries }: { label: string; entries: string[] }) {
  return (
    <Labelled label={label}>
      {entries.length === 0 ? (
        muted('None')
      ) : (
        <CodeBlock compact wrap>
          {entries.join('\n')}
        </CodeBlock>
      )}
    </Labelled>
  )
}

type View = { variant: BadgeVariant; label: string; text: string }

/** The same badges and words as a status line's card, so both kinds read alike on /admin. */
function headline(row: ModReviewRow): View {
  if (row.version.status === 'approved') {
    return {
      variant: 'primaryOutline',
      label: 'published',
      text: PUBLISHED_HEADLINE,
    }
  }
  if (row.version.status === 'rejected') {
    return { variant: 'destructive', label: 'rejected', text: 'Not accepted' }
  }
  if (row.rendered) {
    return { variant: 'primaryOutline', label: 'ready', text: READY_HEADLINE }
  }
  return { variant: 'outline', label: 'needs render', text: 'Render it on your machine:' }
}

const renderCommand = (slug: string) => `bun run render:mods --slug ${slug}`

function meta(row: ModReviewRow) {
  const { mod, version, submitter } = row
  return [
    { label: 'Repo owner', value: mod.authorGithub },
    { label: 'Submitted by', value: submitter ? <AuthorChip author={submitter} /> : '—' },
    { label: 'Slug', value: mod.slug, mono: true },
    { label: 'Plugin', value: `${mod.pluginName} ${version.pluginVersion ?? '(unversioned)'}` },
    { label: 'Version', value: `v${version.versionNumber}` },
    { label: 'Submitted', value: <LocalTime value={version.createdAt} /> },
    { label: 'Licence', value: version.license ?? 'none' },
    {
      label: 'Source',
      mono: true,
      value: (
        <TextLink
          href={folderUrl(version)}
        >{`${version.commitSha.slice(0, 12)}${version.path ? ` · ${version.path}` : ''}`}</TextLink>
      ),
    },
    ...(row.live
      ? [
          {
            label: 'Changes',
            value: (
              <TextLink
                href={`${version.repoUrl}/compare/${row.live.commitSha}...${version.commitSha}`}
              >
                {`Compare with live ${row.live.commitSha.slice(0, 12)}`}
              </TextLink>
            ),
          },
        ]
      : []),
  ]
}

/** A submitted mod on /admin: what it touches, both previews, its source at the commit, and the decision. */
export function ModReviewCard({ row }: { row: ModReviewRow }) {
  const { mod, version } = row
  const view = headline(row)
  const pending = version.status === 'pending'
  return (
    <SectionCard title={mod.title}>
      <Stack gap={4}>
        <Row gap={2} align="center" wrap>
          <Badge variant="outline">Mod</Badge>
          {row.live ? <Badge variant="secondary">{`Update to ${mod.slug}`}</Badge> : null}
          <Badge variant={view.variant}>{view.label}</Badge>
          <Text muted size="sm">
            {view.text}
          </Text>
        </Row>
        {pending && !row.rendered ? (
          <CodeBlock compact wrap text={renderCommand(mod.slug)} copyLabel="Copy command">
            {renderCommand(mod.slug)}
          </CodeBlock>
        ) : null}
        {mod.description ? <Text size="sm">{mod.description}</Text> : null}
        {row.warnings.length > 0 ? (
          <Callout title="Check before approving">
            <Stack gap={1}>
              {row.warnings.map((warning) => (
                <Text key={warning} size="sm">
                  {warning}
                </Text>
              ))}
            </Stack>
          </Callout>
        ) : null}
        <Previews row={row} />
        <Footprint label="Events it hooks" entries={version.footprint.events} />
        <Footprint label="Calls it makes" entries={version.footprint.calls} />
        <RejectionDetails version={version} slug={mod.slug} showActions />
        <ApprovalDetails version={version} showActions />
        <MetaList items={meta(row)} />
        {pending && row.rendered ? (
          <AnalyticsPrivate>
            <ReviewDecisionControls versionId={version.id} />
          </AnalyticsPrivate>
        ) : null}
      </Stack>
    </SectionCard>
  )
}
