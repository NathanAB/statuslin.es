export interface VersionHistoryRow {
  configId: string
  slug: string
  versionNumber: number
  status: string
  source: string
}

export interface ApprovalOutcomeRow {
  configStatus: string
  currentVersionId: string | null
  versionStatus: string
  approvalEmailStatus: string | null
}

export function parseSessionCookie(output: string): string {
  const cookie = output.match(/better-auth\.session_token=(\S+)/)?.[1]
  if (!cookie) throw new Error('dev:login did not return a session cookie')
  return cookie
}

export function browserConsoleErrors(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\[(error|console\.error)\]|hydrat|unhandled/i.test(line))
}

export function assertLinkedHistory(
  rows: VersionHistoryRow[],
  expected: { slug: string; originalSource: string; correctedSource: string },
): void {
  if (rows.length !== 2) throw new Error(`expected 2 versions, found ${rows.length}`)
  const [original, corrected] = rows
  if (!original || !corrected) throw new Error('version history is incomplete')
  if (original.configId !== corrected.configId) throw new Error('resubmission created a new config')
  if (original.slug !== expected.slug || corrected.slug !== expected.slug) {
    throw new Error('resubmission changed the slug')
  }
  if (
    original.versionNumber !== 1 ||
    original.status !== 'rejected' ||
    original.source !== expected.originalSource
  ) {
    throw new Error('rejected v1 was not preserved')
  }
  if (
    corrected.versionNumber !== 2 ||
    corrected.status !== 'pending' ||
    corrected.source !== expected.correctedSource
  ) {
    throw new Error('corrected v2 was not created as pending')
  }
}

export function assertPublishedAfterApprovalFailure(
  row: ApprovalOutcomeRow,
  expectedVersionId: string,
): void {
  if (
    row.configStatus !== 'published' ||
    row.currentVersionId !== expectedVersionId ||
    row.versionStatus !== 'approved' ||
    row.approvalEmailStatus !== 'failed'
  ) {
    throw new Error('approval email failure prevented publication')
  }
}
