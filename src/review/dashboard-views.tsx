import { StatusSummary, SubmissionCard } from '@/review/dashboard-card'
import type { DashboardRow, DashboardUser } from '@/review/queue'
import { Stack } from '@/ui/layout'
import { CenteredShell, PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

export type DashboardData =
  | { rows: DashboardRow[]; user: DashboardUser }
  | { forbidden: true }
  | { signedOut: true }

export function DashboardView({ data }: { data: DashboardData }) {
  if ('signedOut' in data) {
    return <SignInPrompt title="Sign in to access the dashboard" />
  }
  if ('forbidden' in data) {
    return (
      <CenteredShell user={null}>
        <Heading level={1}>Admin dashboard</Heading>
        <Text muted size="sm">
          You don't have access to this page.
        </Text>
      </CenteredShell>
    )
  }

  const { rows, user } = data
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Heading level={1}>Admin dashboard</Heading>
        {rows.length === 0 ? (
          <Text muted size="sm">
            No submissions in flight.
          </Text>
        ) : (
          <>
            <StatusSummary rows={rows} />
            <Stack gap={4}>
              {rows.map((row) => (
                <SubmissionCard key={row.version.id} row={row} />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </PageShell>
  )
}

/** The signed-in author's own submissions — same cards as the admin view, read-only (no actions). */
export function MySubmissionsView({ rows, user }: { rows: DashboardRow[]; user: DashboardUser }) {
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Heading level={1}>My submissions</Heading>
        {rows.length === 0 ? (
          <Text muted size="sm">
            You haven't submitted anything yet.
          </Text>
        ) : (
          <Stack gap={4}>
            {rows.map((row) => (
              <SubmissionCard
                key={row.version.id}
                row={row}
                showActions={false}
                statusMode="review"
                detailSlug={row.config.status === 'published' ? row.config.slug : undefined}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </PageShell>
  )
}
