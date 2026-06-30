import { useRouter } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { useMounted } from '@/lib/use-mounted'
import {
  type BadgeVariant,
  badgeFor,
  CardActions,
  CredentialFlagToggle,
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
  setReadsClaudeTokenFn,
} from '@/review/decide'
import type { DashboardRow } from '@/review/queue'

export { StatusSummary } from '@/review/dashboard-card-parts'

import { Badge } from '@/ui/badge'
import { Row, Stack } from '@/ui/layout'
import { MetaList } from '@/ui/meta-list'
import { Notice } from '@/ui/notice'
import { SectionCard } from '@/ui/section-card'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text } from '@/ui/text'

function waitedSince(date: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h${mins % 60}m`
}

// "Waiting 5m to render" — but the elapsed time reads Date.now() at render, which ticks over between
// the server render and the browser's hydration and throws a hydration error 418. So the duration is
// after mount (browser-only); the server and first client render show the duration-free phrase.
function QueuedHeadline({ since }: { since: Date }) {
  const mounted = useMounted()
  return <>{mounted ? `Waiting ${waitedSince(since)} to render` : 'Waiting to render'}</>
}

// One plain-language line next to the status badge, so the badge isn't the only signal.
function statusHeadline(renderJob: DashboardRow['renderJob']): ReactNode {
  switch (renderJob.status) {
    case 'queued':
      return <QueuedHeadline since={renderJob.createdAt} />
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

type CardView = { variant: BadgeVariant; label: string; headline: ReactNode }

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
        headline: <QueuedHeadline since={renderJob.createdAt} />,
      }
    default:
      return { variant: 'secondary', label: 'in review', headline: 'Waiting for a reviewer' }
  }
}

function cardView(row: DashboardRow, statusMode: 'render' | 'review'): CardView {
  if (statusMode === 'review') return reviewView(row.version, row.renderJob)
  return { ...badgeFor(row.renderJob.status), headline: statusHeadline(row.renderJob) }
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
  const setCredentialFlag = (value: boolean) =>
    run(
      () => setReadsClaudeTokenFn({ data: { versionId: version.id, value } }),
      value ? 'Flagged as reading the auth token.' : 'Cleared the auth-token flag.',
      'Could not update the auth-token flag.',
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
          <Stack gap={3}>
            <CredentialFlagToggle
              value={version.readsClaudeToken}
              pending={pending}
              onChange={setCredentialFlag}
            />
            <CardActions
              isHeld={isHeld}
              isReady={isReady}
              pending={pending}
              onApprove={approve}
              onReject={reject}
              onRequeue={requeue}
              onRunNetworkPreview={runNetworkPreview}
            />
          </Stack>
        ) : null}
      </Stack>
    </SectionCard>
  )
}
