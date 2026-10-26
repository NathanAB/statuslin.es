import { describe, expect, it, vi } from 'vitest'
import type { InputStep } from '@/mods/curation'
import { anthropicUsageSetupScript } from '@/render/anthropic-usage-sandbox'
import { analyseShot } from '@/render/mods/desktop/analyse'
import type { RecordingSetup } from '@/render/mods/desktop/desktop-sandbox'
import { MAX_INPUT_STEPS, MAX_STEP_CHARS } from '@/render/mods/desktop/drive'
import { desktopRecorder, sharedOnce } from '@/render/mods/desktop/recorder'
import type { StatusLineScript } from '@/render/mods/desktop/types'
import type { SandboxFile } from '@/render/mods/mod-sandbox'
import { SAMPLE_PROJECT_FILES } from '@/render/mods/sample-project'

vi.mock('@/render/mods/desktop/analyse', () => ({
  analyseShot: vi.fn(async () => ({ kind: 'nothing' })),
}))

const MOD = { source: { tarball: new Uint8Array(), path: '' }, pluginName: 'token-weather' }
const FULL_SHOT = { desktopVersion: '2.31226.1', engineVersion: '2.1.0', png: new Uint8Array() }

describe('sharedOnce', () => {
  it('runs once for every caller, at the same time or later', async () => {
    const make = vi.fn(async () => 'baseline')
    const baseline = sharedOnce(make)

    const results = await Promise.all([baseline(), baseline(), baseline()])

    expect(results).toEqual(['baseline', 'baseline', 'baseline'])
    expect(await baseline()).toBe('baseline')
    expect(make).toHaveBeenCalledTimes(1)
  })

  it('tries again for the next caller after a failure', async () => {
    const make = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('E2B hiccup'))
      .mockResolvedValue('baseline')
    const baseline = sharedOnce(make)

    await expect(baseline()).rejects.toThrow('E2B hiccup')
    expect(await baseline()).toBe('baseline')
    expect(make).toHaveBeenCalledTimes(2)
  })
})

describe('desktopRecorder', () => {
  it('allows at least the curated steps', () => {
    expect(MAX_INPUT_STEPS).toBeGreaterThanOrEqual(3)
  })

  it('refuses more input steps than the sandbox lifetime fits, before opening a sandbox', async () => {
    const sandboxes = { withRecordingDesktop: vi.fn(), withAnalysisSandbox: vi.fn() }
    const steps = Array.from({ length: MAX_INPUT_STEPS + 1 }, () => ({
      type: 'text' as const,
      text: '/radar',
    }))

    await expect(
      desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: steps }),
    ).rejects.toThrow(/input steps/)
    expect(sandboxes.withRecordingDesktop).not.toHaveBeenCalled()
  })

  it('refuses a step too long to type inside its wait', async () => {
    const sandboxes = { withRecordingDesktop: vi.fn(), withAnalysisSandbox: vi.fn() }
    const step = { type: 'text' as const, text: 'x'.repeat(MAX_STEP_CHARS + 1) }

    await expect(
      desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: [step] }),
    ).rejects.toThrow(/characters/)
    expect(sandboxes.withRecordingDesktop).not.toHaveBeenCalled()
  })

  it("records the baseline typing the mod's input steps, once per distinct list", async () => {
    const baselineSteps: string[][] = []
    const sandboxes = {
      withRecordingDesktop: vi
        .fn()
        .mockImplementation(
          async (setup: {
            source: unknown
            files: (versions: typeof FULL_SHOT) => { path: string; data: string | Uint8Array }[]
          }) => {
            if (setup.source === null) {
              const typed = setup.files(FULL_SHOT).filter((f) => /step-\d+\.txt$/.test(f.path))
              baselineSteps.push(typed.map((f) => String(f.data)))
            }
            return FULL_SHOT
          },
        ),
      withAnalysisSandbox: vi.fn().mockImplementation((use: (a: object) => unknown) => use({})),
    }
    const recorder = desktopRecorder(sandboxes)
    const pet = [{ type: 'text' as const, text: '/pet' }]

    for (const inputSteps of [pet, [], [{ type: 'text' as const, text: '/pet' }]]) {
      await recorder.record({ mod: MOD, inputSteps })
    }

    expect(baselineSteps).toEqual([['/pet'], []])
  })

  it.each([
    {
      steps: [{ type: 'text' as const, text: '/stand' }],
      typedSteps: true,
      typedSlashCommand: true,
    },
    {
      steps: [{ type: 'text' as const, text: 'hello' }],
      typedSteps: true,
      typedSlashCommand: false,
    },
    { steps: [], typedSteps: false, typedSlashCommand: false },
  ])(
    'tells the analysis whether the sessions typed input steps ($typedSteps) and a slash command ($typedSlashCommand)',
    async ({ steps, typedSteps, typedSlashCommand }) => {
      const sandboxes = {
        withRecordingDesktop: vi.fn().mockResolvedValue(FULL_SHOT),
        withAnalysisSandbox: vi.fn().mockImplementation((use: (a: object) => unknown) => use({})),
      }

      await desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: steps })

      expect(vi.mocked(analyseShot)).toHaveBeenLastCalledWith(
        {},
        expect.objectContaining({ typedSteps, typedSlashCommand }),
      )
    },
  )
})

describe('desktopRecorder status line', () => {
  const VERSIONS = { desktopVersion: '2.31226.1', engineVersion: '2.1.0' }

  /** The files each recording session staged: the baseline's, then the mod's. */
  async function stagedFiles(statusLine?: StatusLineScript, inputSteps: InputStep[] = []) {
    const staged: Map<string, SandboxFile['data']>[] = []
    const sandboxes = {
      withRecordingDesktop: vi.fn().mockImplementation(async (setup: RecordingSetup) => {
        staged.push(new Map(setup.files(VERSIONS).map((f) => [f.path, f.data])))
        return FULL_SHOT
      }),
      withAnalysisSandbox: vi.fn().mockImplementation((use: (a: object) => unknown) => use({})),
    }
    const request = { mod: MOD, inputSteps }
    await desktopRecorder(sandboxes).record(statusLine ? { ...request, statusLine } : request)
    return staged
  }

  const statusLineFiles = (files: Map<string, SandboxFile['data']> | undefined) =>
    [...(files ?? [])].filter(([path]) => /\/statusline\.[a-z]+$/.test(path))

  const SAMPLE = [
    expect.stringMatching(/\/statusline\.sh$/),
    expect.stringContaining('#!/bin/bash'),
  ]

  const workspaceFiles = (files: Map<string, SandboxFile['data']> | undefined) =>
    [...(files?.keys() ?? [])].filter((path) => path.startsWith('/home/user/app/'))
  const settingsKeys = (files: Map<string, SandboxFile['data']> | undefined) => {
    const settings = [...(files ?? [])].find(([path]) => path.endsWith('/.claude/settings.json'))
    return Object.keys(JSON.parse(String(settings?.[1])))
  }

  it('stages the busy workspace and settings for both sessions when the steps type /preview-busy', async () => {
    const staged = await stagedFiles(undefined, [{ type: 'text', text: '/preview-busy' }])

    for (const files of staged) {
      expect(workspaceFiles(files)).toContain('/home/user/app/package.json')
      expect(settingsKeys(files)).toEqual(['permissions', 'sandbox', 'statusLine'])
    }
  })

  it('stages only the status line settings, and only the sample project, when the steps never do', async () => {
    const staged = await stagedFiles(undefined, [{ type: 'text', text: '/pet' }])

    for (const files of staged) {
      expect(workspaceFiles(files)).toEqual(
        SAMPLE_PROJECT_FILES.map((f) => `/home/user/app/${f.path}`),
      )
      expect(settingsKeys(files)).toEqual(['statusLine'])
    }
  })

  it("stages the given status line for the mod's session, and the sample for the baseline", async () => {
    const [baseline, session] = await stagedFiles({ source: 'print("hi")', interpreter: 'python' })

    expect(statusLineFiles(session)).toEqual([
      [expect.stringMatching(/\/statusline\.py$/), 'print("hi")'],
    ])
    expect(statusLineFiles(baseline)).toEqual([SAMPLE])
  })

  it("opens the status line's hosts and mock for the mod's session, and keeps the baseline offline", async () => {
    const setups: RecordingSetup[] = []
    const sandboxes = {
      withRecordingDesktop: vi.fn().mockImplementation(async (setup: RecordingSetup) => {
        setups.push(setup)
        return FULL_SHOT
      }),
      withAnalysisSandbox: vi.fn().mockImplementation((use: (a: object) => unknown) => use({})),
    }
    const statusLine = {
      source: 'cat ~/.claude/.credentials.json',
      interpreter: 'bash' as const,
      networkHosts: ['api.anthropic.com', 'wttr.in'],
      readsClaudeToken: true,
    }

    await desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: [], statusLine })

    const [baseline, session] = setups
    expect(baseline).toMatchObject({ networkHosts: [], rootCommand: null })
    expect(session).toMatchObject({
      networkHosts: ['wttr.in'],
      rootCommand: anthropicUsageSetupScript(),
    })
  })

  it('refuses a status line that needs a real Anthropic host, before opening a sandbox', async () => {
    const sandboxes = { withRecordingDesktop: vi.fn(), withAnalysisSandbox: vi.fn() }
    const statusLine = { source: 'echo', interpreter: 'bash' as const, networkHosts: ['claude.ai'] }

    await expect(
      desktopRecorder(sandboxes).record({ mod: MOD, inputSteps: [], statusLine }),
    ).rejects.toThrow(/Anthropic host/)
    expect(sandboxes.withRecordingDesktop).not.toHaveBeenCalled()
  })

  it('stages the sample for a mod recording with no status line', async () => {
    const [, session] = await stagedFiles()

    expect(statusLineFiles(session)).toEqual([SAMPLE])
  })
})
