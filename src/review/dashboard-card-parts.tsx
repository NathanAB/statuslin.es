import { orderByScenario, SCENARIO_BY_KEY } from '@/render/scenarios'
import type { DashboardRow } from '@/review/queue'
import { AuthorChip } from '@/ui/author-chip'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { CodeBlock } from '@/ui/code-block'
import { Details } from '@/ui/details'
import { Label } from '@/ui/label'
import { Row, Stack } from '@/ui/layout'
import { LocalTime } from '@/ui/local-time'
import { ScenarioRow } from '@/ui/scenario-row'
import { StretchedLink } from '@/ui/stretched-link'
import { Switch } from '@/ui/switch'
import { Text } from '@/ui/text'

export type RenderStatus = DashboardRow['renderJob']['status']
export type BadgeVariant = 'secondary' | 'destructive' | 'outline' | 'primaryOutline'

// Render status → badge look + label. Failed is loud (destructive); ready gets a coral *outline*
// (not a coral fill — that reads as a clickable button) to draw the eye to the actionable row.
export const RENDER_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  failed: { variant: 'destructive', label: 'failed' },
  running: { variant: 'secondary', label: 'rendering' },
  queued: { variant: 'outline', label: 'queued' },
  done: { variant: 'primaryOutline', label: 'ready' },
  held: { variant: 'outline', label: 'needs network review' },
}

export function badgeFor(status: RenderStatus): { variant: BadgeVariant; label: string } {
  return RENDER_BADGE[status] ?? { variant: 'outline', label: status }
}

export function StatusSummary({ rows }: { rows: DashboardRow[] }) {
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.renderJob.status] = (acc[r.renderJob.status] ?? 0) + 1
    return acc
  }, {})
  const order: RenderStatus[] = ['held', 'failed', 'running', 'queued', 'done']
  return (
    <Row gap={2}>
      {order
        .filter((s) => counts[s])
        .map((s) => (
          <Badge key={s} variant={badgeFor(s).variant}>
            {counts[s]} {badgeFor(s).label}
          </Badge>
        ))}
    </Row>
  )
}

/** A published card's title is a stretched link (whole card → detail page); otherwise plain text. */
export function titleFor(config: DashboardRow['config'], detailSlug: string | undefined) {
  if (detailSlug === undefined) return config.title
  return (
    <StretchedLink to="/c/$slug" params={{ slug: detailSlug }}>
      {config.title}
    </StretchedLink>
  )
}

/** /me (review) drops the redundant "Author: you" row — every card there is the viewer's own. */
export function metaItems(
  config: DashboardRow['config'],
  version: DashboardRow['version'],
  statusMode: 'render' | 'review',
) {
  const author = {
    label: 'Author',
    value: config.author ? <AuthorChip author={config.author} /> : '—',
  }
  return [
    ...(statusMode === 'review' ? [] : [author]),
    { label: 'Interpreter', value: config.interpreter },
    { label: 'Version', value: `v${version.versionNumber}` },
    { label: 'Submitted', value: <LocalTime value={version.createdAt} /> },
    { label: 'Slug', value: config.slug, mono: true },
    { label: 'SHA', value: version.contentSha256.slice(0, 12), mono: true },
  ]
}

/** Collapsible render-output + source. `hidden` on linked cards: the stretched-link overlay would
 *  cover them, and the detail page they link to already shows both. The render-output disclosure
 *  shows EVERY scenario (not just clean-main) so a reviewer can judge how the statusline behaves
 *  across the full matrix — a scenario that renders empty or errors is what review needs to catch. */
export function SubmissionDetails({
  hidden,
  previews,
  source,
}: {
  hidden: boolean
  previews: DashboardRow['previews']
  source: string
}) {
  if (hidden) return null
  const ordered = orderByScenario(previews)
  return (
    <>
      {ordered.length > 0 ? (
        <Details summary={`Render output — ${ordered.length} scenarios`}>
          <Stack gap={3}>
            {ordered.map((p) => {
              const scenario = SCENARIO_BY_KEY.get(p.scenarioKey)
              const failed = p.exitCode !== 0 || p.timedOut
              return (
                <Stack key={p.scenarioKey} gap={1}>
                  <ScenarioRow
                    shortLabel={scenario?.shortLabel ?? p.scenarioKey}
                    title={scenario?.label ?? p.scenarioKey}
                    segments={p.segments}
                  />
                  {failed ? (
                    <Text muted size="sm">
                      {`exit ${p.exitCode}${p.timedOut ? ' · timed out' : ''}`}
                    </Text>
                  ) : null}
                </Stack>
              )
            })}
          </Stack>
        </Details>
      ) : null}
      <Details summary="Source">
        <CodeBlock compact>{source}</CodeBlock>
      </Details>
    </>
  )
}

/** Badges listing the network hosts declared by the script version. Only rendered when non-empty. */
export function NetworkHostList({ hosts }: { hosts: string[] }) {
  if (hosts.length === 0) return null
  return (
    <Stack gap={1.5}>
      <Text size="sm">Declared network hosts</Text>
      <Row gap={2} wrap>
        {hosts.map((h) => (
          <Badge key={h} variant="secondary">
            {h}
          </Badge>
        ))}
      </Row>
    </Stack>
  )
}

/** Admin-only toggle for the "reads the Claude Code auth token" disclosure flag. */
export function CredentialFlagToggle({
  value,
  pending,
  onChange,
}: {
  value: boolean
  pending: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <Row gap={2} align="center">
      <Switch
        id="reads-claude-token"
        checked={value}
        disabled={pending}
        onCheckedChange={onChange}
      />
      <Label htmlFor="reads-claude-token">Reads the Claude Code auth token</Label>
    </Row>
  )
}

/** Approve / Reject / Re-queue / Run-network-preview action row for the admin queue card. */
export function CardActions({
  isHeld,
  isReady,
  pending,
  onApprove,
  onReject,
  onRequeue,
  onRunNetworkPreview,
}: {
  isHeld: boolean
  isReady: boolean
  pending: boolean
  onApprove: () => void
  onReject: () => void
  onRequeue: () => void
  onRunNetworkPreview: () => void
}) {
  if (isHeld) {
    return (
      <Row gap={2}>
        <Button type="button" onClick={onRunNetworkPreview} disabled={pending}>
          {pending ? 'Starting…' : 'Run network preview'}
        </Button>
      </Row>
    )
  }
  if (isReady) {
    return (
      <Row gap={2}>
        <Button type="button" onClick={onApprove} disabled={pending}>
          Approve
        </Button>
        <Button type="button" variant="destructive" onClick={onReject} disabled={pending}>
          Reject
        </Button>
      </Row>
    )
  }
  return (
    <Row gap={2}>
      <Button type="button" variant="secondary" onClick={onRequeue} disabled={pending}>
        {pending ? 'Re-queuing…' : 'Re-queue'}
      </Button>
    </Row>
  )
}
