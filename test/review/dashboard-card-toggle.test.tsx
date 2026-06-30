// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardRow } from '@/review/queue'

// The card uses useRouter() to invalidate after an action; stub it.
// Link needs a router context too — stub it to a plain anchor.
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const setReadsClaudeTokenFn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const approveVersionFn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const rejectVersionFn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const requeueRenderJobFn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const runNetworkPreviewFn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/review/decide', () => ({
  approveVersionFn,
  rejectVersionFn,
  requeueRenderJobFn,
  runNetworkPreviewFn,
  setReadsClaudeTokenFn,
}))

const { SubmissionCard } = await import('@/review/dashboard-card')

function row(over: {
  status: string
  id?: string
  error?: string | null
  withPreview?: boolean
  versionStatus?: string
  networkHosts?: string[]
  readsClaudeToken?: boolean
}): DashboardRow {
  return {
    config: {
      id: 'c1',
      slug: 'my-line',
      title: 'My line',
      description: '',
      interpreter: 'bash',
      status: 'draft',
      authorId: 'u1',
      author: { name: 'Test User', username: 'test', image: null },
      upvoteCount: 0,
      copyCount: 0,
      createdAt: new Date('2026-06-13T12:00:00Z'),
    },
    version: {
      id: over.id ?? 'v1',
      versionNumber: 1,
      source: '#!/bin/bash\necho hi',
      contentSha256: 'abc123def456',
      status: over.versionStatus ?? 'pending',
      createdAt: new Date('2026-06-13T12:00:00Z'),
      networkHosts: over.networkHosts ?? [],
      readsClaudeToken: over.readsClaudeToken ?? false,
    },
    renderJob: {
      status: over.status,
      attempts: over.status === 'failed' ? 2 : 0,
      error: over.error ?? null,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      finishedAt: over.status === 'done' ? new Date('2026-06-13T12:01:00Z') : null,
    },
    previews: over.withPreview
      ? [
          {
            scenarioKey: 'clean-main',
            segments: [
              { text: 'hi', fg: null, bg: null, bold: false, italic: false, underline: false },
            ],
            rawStdout: 'hi',
            exitCode: 0,
            timedOut: false,
            trace: { commands: [], network: [], files: [] } as never,
          },
        ]
      : [],
  }
}

describe('SubmissionCard credential toggle', () => {
  it('clicking the switch calls setReadsClaudeTokenFn and shows a success toast', async () => {
    render(<SubmissionCard row={row({ status: 'done', readsClaudeToken: false })} />)

    const toggle = screen.getByRole('switch', { name: /reads the claude code auth token/i })
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(setReadsClaudeTokenFn).toHaveBeenCalledWith({
        data: { versionId: 'v1', value: true },
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Flagged as reading the auth token.')
  })
})
