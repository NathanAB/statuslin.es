import { describe, expect, it, vi } from 'vitest'
import {
  assertAllowedE2ETarget,
  assertDisposableUserCleanup,
  assertLinkedHistory,
  assertPublishedAfterApprovalDelivery,
  browserConsoleErrors,
  browserCookieCommand,
  commandFailureMessage,
  describeBrowserCommand,
  isTerminalDecisionEmailStatus,
  parseSessionCookie,
  renderStrategy,
  runDisposableUserCleanup,
  sessionCookieName,
} from '../../scripts/e2e/rejection-resubmission-helpers'

describe('rejection/resubmission E2E helpers', () => {
  it('extracts the signed Better Auth cookie from dev:login output', () => {
    expect(
      parseSessionCookie(`
Signed in as E2E Author <e2e-author@test.invalid> (role: user)

better-auth.session_token=token.signature==
`),
    ).toBe('token.signature==')
    expect(() => parseSessionCookie('No user matching "missing".')).toThrow(
      'dev:login did not return a session cookie',
    )
  })

  it('treats hydration and browser console errors as E2E failures while ignoring Vite noise', () => {
    expect(
      browserConsoleErrors(`
[debug] [vite] connected.
[error] Hydration failed because the server rendered text didn't match the client.
[console.error] Unhandled rejection
`),
    ).toEqual([
      "[error] Hydration failed because the server rendered text didn't match the client.",
      '[console.error] Unhandled rejection',
    ])
    expect(browserConsoleErrors('[debug] [vite] connected.')).toEqual([])
  })

  it('identifies browser waits and selectors without exposing submitted values or cookies', () => {
    expect(describeBrowserCommand('author', ['wait', '--load', 'networkidle'])).toBe(
      'author browser: wait --load networkidle',
    )
    expect(describeBrowserCommand('author', ['fill', '#source', 'secret script source'])).toBe(
      'author browser: fill #source',
    )
    expect(describeBrowserCommand('author', ['get', 'value', '#source'])).toBe(
      'author browser: get #source',
    )
    expect(
      describeBrowserCommand('author', [
        'cookies',
        'set',
        'better-auth.session_token',
        'secret-cookie',
      ]),
    ).toBe('author browser: cookies set')
  })

  it('uses Better Auth’s secure cookie name only for HTTPS targets', () => {
    expect(sessionCookieName('http://localhost:3100')).toBe('better-auth.session_token')
    expect(sessionCookieName('https://staging.statuslin.es')).toBe(
      '__Secure-better-auth.session_token',
    )
  })

  it('constructs secure staging cookies without weakening local cookies', () => {
    expect(browserCookieCommand('http://localhost:3100', 'test-cookie')).toEqual([
      'cookies',
      'set',
      'better-auth.session_token',
      'test-cookie',
      '--url',
      'http://localhost:3100',
      '--httpOnly',
    ])
    expect(browserCookieCommand('https://staging.statuslin.es', 'test-cookie')).toEqual([
      'cookies',
      'set',
      '__Secure-better-auth.session_token',
      'test-cookie',
      '--url',
      'https://staging.statuslin.es',
      '--httpOnly',
      '--secure',
    ])
  })

  it('refuses to forge sessions outside the exact local and staging origins', () => {
    expect(() => assertAllowedE2ETarget('http://localhost:3100')).not.toThrow()
    expect(() => assertAllowedE2ETarget('https://staging.statuslin.es')).not.toThrow()
    expect(() => assertAllowedE2ETarget('https://statuslin.es')).toThrow(
      'E2E target is not allowed',
    )
    expect(() => assertAllowedE2ETarget('https://staging.statuslin.es.attacker.test')).toThrow(
      'E2E target is not allowed',
    )
  })

  it('redacts raw command output and cleanup errors from harness failures', () => {
    expect(
      commandFailureMessage(
        'author browser: fill #source',
        'secret script source and session cookie',
        false,
      ),
    ).toBe('author browser: fill #source failed')
    expect(() =>
      assertDisposableUserCleanup({
        status: 'rejected',
        reason: new Error('postgres://secret@database'),
      }),
    ).toThrow('failed to remove disposable E2E users')
    expect(() =>
      assertDisposableUserCleanup({
        status: 'fulfilled',
        value: [{ id: 'e2e-rejection-author' }],
      }),
    ).not.toThrow()
  })

  it('retries a transient disposable-user cleanup failure once', async () => {
    const cleanup = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('connection closed'))
      .mockResolvedValueOnce([{ id: 'e2e-rejection-author' }])

    const result = await runDisposableUserCleanup(cleanup)

    expect(cleanup).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      status: 'fulfilled',
      value: [{ id: 'e2e-rejection-author' }],
    })
  })

  it('renders inline only when the E2E targets the local app', () => {
    expect(renderStrategy('http://localhost:3100')).toBe('inline')
    expect(renderStrategy('https://staging.statuslin.es')).toBe('external')
  })

  it('accepts only a same-config, same-slug rejected v1 and pending v2 history', () => {
    expect(() =>
      assertLinkedHistory(
        [
          {
            configId: 'config-1',
            slug: 'e2e-line-abcd1234',
            versionNumber: 1,
            status: 'rejected',
            source: 'echo original',
          },
          {
            configId: 'config-1',
            slug: 'e2e-line-abcd1234',
            versionNumber: 2,
            status: 'pending',
            source: 'echo corrected',
          },
        ],
        {
          slug: 'e2e-line-abcd1234',
          originalSource: 'echo original',
          correctedSource: 'echo corrected',
        },
      ),
    ).not.toThrow()
  })

  it.each([
    'sent',
    'failed',
    'unavailable',
    'ambiguous',
  ])('requires a published corrected version after %s approval email delivery', (approvalEmailStatus) => {
    expect(() =>
      assertPublishedAfterApprovalDelivery(
        {
          configStatus: 'published',
          currentVersionId: 'version-2',
          versionStatus: 'approved',
          approvalEmailStatus,
        },
        'version-2',
      ),
    ).not.toThrow()
  })

  it('rejects a non-terminal approval email status', () => {
    expect(() =>
      assertPublishedAfterApprovalDelivery(
        {
          configStatus: 'published',
          currentVersionId: 'version-2',
          versionStatus: 'approved',
          approvalEmailStatus: 'sending',
        },
        'version-2',
      ),
    ).toThrow('approval decision is not fully published')
  })

  it('distinguishes terminal decision email outcomes from in-progress delivery', () => {
    expect(
      ['sent', 'failed', 'unavailable', 'ambiguous'].map(isTerminalDecisionEmailStatus),
    ).toEqual([true, true, true, true])
    expect(['pending', 'sending', null].map(isTerminalDecisionEmailStatus)).toEqual([
      false,
      false,
      false,
    ])
  })

  it.each([
    [
      'a new config',
      [
        {
          configId: 'config-1',
          slug: 'e2e-line-abcd1234',
          versionNumber: 1,
          status: 'rejected',
          source: 'echo original',
        },
        {
          configId: 'config-2',
          slug: 'e2e-line-abcd1234',
          versionNumber: 2,
          status: 'pending',
          source: 'echo corrected',
        },
      ],
    ],
    [
      'mutated v1 source',
      [
        {
          configId: 'config-1',
          slug: 'e2e-line-abcd1234',
          versionNumber: 1,
          status: 'rejected',
          source: 'echo changed',
        },
        {
          configId: 'config-1',
          slug: 'e2e-line-abcd1234',
          versionNumber: 2,
          status: 'pending',
          source: 'echo corrected',
        },
      ],
    ],
  ])('rejects %s', (_name, rows) => {
    expect(() =>
      assertLinkedHistory(rows, {
        slug: 'e2e-line-abcd1234',
        originalSource: 'echo original',
        correctedSource: 'echo corrected',
      }),
    ).toThrow()
  })
})
