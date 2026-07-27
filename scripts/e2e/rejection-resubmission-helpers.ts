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

const ALLOWED_E2E_ORIGINS = new Set(['http://localhost:3100', 'https://staging.statuslin.es'])

export function assertAllowedE2ETarget(baseUrl: string): void {
  const target = new URL(baseUrl)
  if (
    !ALLOWED_E2E_ORIGINS.has(target.origin) ||
    target.pathname !== '/' ||
    target.search !== '' ||
    target.hash !== ''
  ) {
    throw new Error('E2E target is not allowed')
  }
}

export function assertDisposableUserCleanup(result: PromiseSettledResult<unknown>): void {
  if (result.status === 'rejected') {
    throw new Error('failed to remove disposable E2E users')
  }
}

export async function runDisposableUserCleanup(
  cleanup: () => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>> {
  let result = await Promise.allSettled([cleanup()])
  if (result[0]?.status === 'rejected') {
    result = await Promise.allSettled([cleanup()])
  }
  return result[0] ?? { status: 'rejected', reason: new Error('cleanup did not run') }
}

export function isTerminalDecisionEmailStatus(status: string | null | undefined): boolean {
  return ['sent', 'failed', 'unavailable', 'ambiguous'].includes(status ?? '')
}

export function parseSessionCookie(output: string): string {
  const cookie = output.match(/better-auth\.session_token=(\S+)/)?.[1]
  if (!cookie) throw new Error('dev:login did not return a session cookie')
  return cookie
}

export function sessionCookieName(baseUrl: string): string {
  const prefix = new URL(baseUrl).protocol === 'https:' ? '__Secure-' : ''
  return `${prefix}better-auth.session_token`
}

export function browserCookieCommand(baseUrl: string, cookie: string): string[] {
  const command = [
    'cookies',
    'set',
    sessionCookieName(baseUrl),
    cookie,
    '--url',
    baseUrl,
    '--httpOnly',
  ]
  if (new URL(baseUrl).protocol === 'https:') command.push('--secure')
  return command
}

export function renderStrategy(baseUrl: string): 'inline' | 'external' {
  return new URL(baseUrl).hostname === 'localhost' ? 'inline' : 'external'
}

export function commandFailureMessage(
  label: string,
  output: string,
  exposeOutput: boolean,
): string {
  return `${label} failed${exposeOutput && output ? `: ${output}` : ''}`
}

export function browserConsoleErrors(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\[(error|console\.error)\]|hydrat|unhandled/i.test(line))
}

export function describeBrowserCommand(session: string, args: string[]): string {
  const [command, first, second] = args
  const prefix = `${session} browser: ${command ?? 'unknown'}`
  if (command === 'wait') {
    return [prefix, first, second].filter(Boolean).join(' ')
  }
  if (command === 'cookies') {
    return [prefix, first].filter(Boolean).join(' ')
  }
  if (command === 'get') {
    return [prefix, second].filter(Boolean).join(' ')
  }
  if (['click', 'fill', 'select', 'type'].includes(command ?? '')) {
    return [prefix, first].filter(Boolean).join(' ')
  }
  return prefix
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

export function assertPublishedAfterApprovalDelivery(
  row: ApprovalOutcomeRow,
  expectedVersionId: string,
): void {
  if (
    row.configStatus !== 'published' ||
    row.currentVersionId !== expectedVersionId ||
    row.versionStatus !== 'approved' ||
    !isTerminalDecisionEmailStatus(row.approvalEmailStatus)
  ) {
    throw new Error('approval decision is not fully published')
  }
}
