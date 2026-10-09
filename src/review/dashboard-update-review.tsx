import type { LiveVersion } from '@/review/live-version'
import type { DashboardRow } from '@/review/queue'
import { scriptDiff } from '@/review/script-diff'
import { Badge } from '@/ui/badge'
import { Callout } from '@/ui/callout'
import { FactTable } from '@/ui/fact-table'
import { Row, Stack } from '@/ui/layout'
import { LineDiff } from '@/ui/line-diff'
import { Text } from '@/ui/text'

const LISTING_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'interpreter', label: 'Interpreter' },
] as const

const shown = (value: string) => (value === '' ? '(empty)' : value)

/** What an update changes against the config's live version: added network hosts first (the
 *  most security-relevant change), then listing fields that changed, then the script diff. */
export function UpdateReview({
  version,
  live,
}: {
  version: DashboardRow['version']
  live: LiveVersion
}) {
  const changed = LISTING_FIELDS.filter(({ key }) => live[key] !== version[key])
  const addedHosts = version.networkHosts.filter((host) => !live.networkHosts.includes(host))
  const diff = scriptDiff(live.source, version.source)
  return (
    <Stack gap={4}>
      {addedHosts.length > 0 ? (
        <Callout
          title="Adds network access"
          description="The live version can't reach these hosts."
        >
          <Row gap={2} wrap>
            {addedHosts.map((host) => (
              <Badge key={host} variant="primaryOutline">
                {host}
              </Badge>
            ))}
          </Row>
        </Callout>
      ) : null}
      {changed.length > 0 ? (
        <FactTable
          columns={['Live', 'Update']}
          rows={changed.map(({ key, label }) => ({
            label,
            cells: [shown(live[key]), shown(version[key])],
          }))}
        />
      ) : null}
      <Stack gap={1.5}>
        <Text size="sm">Script changes</Text>
        {diff.length > 0 ? (
          <LineDiff lines={diff} />
        ) : (
          <Text muted size="sm">
            Script unchanged
          </Text>
        )}
      </Stack>
    </Stack>
  )
}
