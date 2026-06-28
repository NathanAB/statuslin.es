import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  CardActions,
  metaItems,
  NetworkHostList,
  SubmissionDetails,
  titleFor,
} from '@/review/dashboard-card-parts'
import {
  approveVersionFn,
  rejectVersionFn,
  requeueRenderJobFn,
  runNetworkPreviewFn,
} from '@/review/decide'
import type { DashboardRow } from '@/review/queue'
import { Badge } from '@/ui/badge'
import { Row, Stack } from '@/ui/layout'
import { MetaList } from '@/ui/meta-list'
import { Notice } from '@/ui/notice'
import { SectionCard } from '@/ui/section-card'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text } from '@/ui/text'

type RenderStatus = DashboardRow['renderJob']['status']
type BadgeVariant = 'secondary' | 'destructive' | 'outline' | 'primaryOutline'

// Render status → badge look + label. Failed is loud (destructive); ready gets a coral *outline*
// (not a coral fill — that reads as a clickable button) to draw the eye to the actionable row.
const RENDER_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  failed: { variant: 'destructive', label: 'failed' },
  running: { variant: 'secondary', label: 'rendering' },
  queued: { variant: 'outline', label: 'queued' },
  done: { variant: 'primaryOutline', label: 'ready' },
  held: { variant: 'outline', label: 'needs network review' },
}

function badgeFor(status: RenderStatus): { variant: BadgeVariant; label: string } {
  return RENDER_BADGE[status] ?? { variant: 'outline', label: status }
}

function waitedSince(date: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h${mins % 60}m`
}

// One plain-language line next to the status badge, so the badge isn't the only signal.
function statusHeadline(renderJob: DashboardRow['renderJob']): string {
  switch (renderJob.status) {
    case 'queued':
      return `Waiting ${waitedSince(renderJob.createdAt)} to render`
    case 'running':
      return 'Rendering now…'
    case 'failed':
      return renderJob.attempts > 0
        ? `Render failed after ${renderJob.attempts} attempts`
        : 'Render failed'
    case 'done':
      return 'Rendered — ready to review'
    case 'held':
      return 'Declared network access — review hosts, then run the preview'
    default:
      return renderJob.status
  }
}

type CardView = { variant: BadgeVariant; label: string; headline: string }

/** Author-facing status for /me: review outcome first; render state only while still pending,
 * so a stuck or failed render is still visible. Published/rejected never show "ready". */
function reviewView(
  version: DashboardRow['version'],
  renderJob: DashboardRow['renderJob'],
): CardView {
  if (version.status === 'approved') {
    return {
      variant: 'primaryOutline',
      label: 'published',
      headline: 'Published — live in the gallery',
    }
  }
  if (version.status === 'rejected') {
    return { variant: 'destructive', label: 'rejected', headline: 'Not accepted' }
  }
  switch (renderJob.status) {
    case 'failed':
      return { variant: 'destructive', label: 'failed', headline: statusHeadline(renderJob) }
    case 'running':
      return { variant: 'secondary', label: 'rendering', headline: 'Rendering now…' }
    case 'queued':
      return {
        variant: 'outline',
        label: 'queued',
        headline: `Waiting ${waitedSince(renderJob.createdAt)} to render`,
      }
    default:
      return { variant: 'secondary', label: 'in review', headline: 'Waiting for a reviewer' }
  }
}

function cardView(row: DashboardRow, statusMode: 'render' | 'review'): CardView {
  if (statusMode === 'review') return reviewView(row.version, row.renderJob)
  return { ...badgeFor(row.renderJob.status), headline: statusHeadline(row.renderJob) }
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

export function SubmissionCard({
  row,
  showActions = true,
  statusMode = 'render',
  detailSlug,
}: {
  row: DashboardRow
  /** Admin view shows Approve/Reject/Re-queue; an author's own /me view is read-only. */
  showActions?: boolean
  /** 'render' (admin queue) labels by render step; 'review' (/me) labels by review outcome. */
  statusMode?: 'render' | 'review'
  /** When the config is published, its detail-page slug — turns the whole card into a link
   *  (gallery hover + stretched title) and drops the disclosures the detail page already shows. */
  detailSlug?: string | undefined
}) {
  const router = useRouter()
  const { config, version, renderJob, previews } = row
  const view = cardView(row, statusMode)
  const linked = detailSlug !== undefined
  const preview = previews.find((p) => p.scenarioKey === 'clean-main') ?? previews[0]
  const isReady = renderJob.status === 'done'
  const isHeld = renderJob.status === 'held'
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>, success: string, failure: string) {
    if (pending) return
    setPending(true)
    try {
      await action()
      toast.success(success)
      await router.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure)
    } finally {
      setPending(false)
    }
  }

  const approve = () =>
    run(
      () => approveVersionFn({ data: { versionId: version.id } }),
      'Approved and published.',
      'Could not approve.',
    )
  const reject = () =>
    run(
      () => rejectVersionFn({ data: { versionId: version.id } }),
      'Rejected.',
      'Could not reject.',
    )
  const requeue = () =>
    run(
      () => requeueRenderJobFn({ data: { versionId: version.id } }),
      "Sent back to the render queue — it'll render when the worker picks it up.",
      'Could not re-queue.',
    )
  const runNetworkPreview = () =>
    run(
      () => runNetworkPreviewFn({ data: { versionId: version.id } }),
      "Network preview queued — it'll render with the declared hosts.",
      'Could not start the network preview.',
    )

  return (
    <SectionCard interactive={linked} title={titleFor(config, detailSlug)}>
      <Stack gap={4}>
        <Row gap={2} align="center" wrap>
          <Badge variant={view.variant}>{view.label}</Badge>
          <Text muted size="sm">
            {view.headline}
          </Text>
        </Row>

        {config.description ? <Text size="sm">{config.description}</Text> : null}

        {isReady && preview ? <StatuslinePreview segments={preview.segments} /> : null}

        {renderJob.status === 'failed' && renderJob.error ? (
          <Notice tone="error">{renderJob.error}</Notice>
        ) : null}

        <NetworkHostList hosts={version.networkHosts} />

        <MetaList items={metaItems(config, version, statusMode)} />

        <SubmissionDetails
          hidden={linked}
          previews={isReady ? previews : []}
          source={version.source}
        />

        {showActions ? (
          <CardActions
            isHeld={isHeld}
            isReady={isReady}
            pending={pending}
            onApprove={approve}
            onReject={reject}
            onRequeue={requeue}
            onRunNetworkPreview={runNetworkPreview}
          />
        ) : null}
      </Stack>
    </SectionCard>
  )
}
