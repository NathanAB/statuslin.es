import { describe, expect, it } from 'vitest'
import {
  assertLinkedHistory,
  assertPublishedAfterApprovalFailure,
  browserConsoleErrors,
  parseSessionCookie,
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

  it('requires approval email failure to leave the corrected version published', () => {
    expect(() =>
      assertPublishedAfterApprovalFailure(
        {
          configStatus: 'published',
          currentVersionId: 'version-2',
          versionStatus: 'approved',
          approvalEmailStatus: 'failed',
        },
        'version-2',
      ),
    ).not.toThrow()
    expect(() =>
      assertPublishedAfterApprovalFailure(
        {
          configStatus: 'draft',
          currentVersionId: null,
          versionStatus: 'approved',
          approvalEmailStatus: 'failed',
        },
        'version-2',
      ),
    ).toThrow('approval email failure prevented publication')
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
