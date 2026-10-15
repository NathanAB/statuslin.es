import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { E2B_DESKTOP_TEMPLATE_ID } from '@/render/e2b-template'

const fake = vi.hoisted(() => ({
  events: [] as string[],
  sandbox: {
    files: { write: vi.fn(), read: vi.fn() },
    commands: { run: vi.fn() },
    kill: vi.fn(),
  },
  create: vi.fn(),
}))

vi.mock('e2b', async (importOriginal) => {
  const actual = await importOriginal<typeof import('e2b')>()
  return { ...actual, Sandbox: { create: fake.create } }
})

import { withAnalysisSandbox, withRecordingDesktop } from '@/render/mods/desktop/desktop-sandbox'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

/** Answers each command as the template would, and logs it. */
function answer(command: string): string {
  if (command.includes('dpkg-query')) return '2.31226.1'
  if (command.includes('engine-version')) return '2.1.295\n'
  if (command.includes('base64 -w0')) return Buffer.from(PNG).toString('base64')
  return ''
}

beforeEach(() => {
  vi.stubEnv('E2B_API_KEY', 'test-key')
  fake.events.length = 0
  fake.create.mockResolvedValue(fake.sandbox)
  fake.sandbox.kill.mockImplementation(async () => {
    fake.events.push('kill')
  })
  fake.sandbox.files.write.mockImplementation(async (files: { path: string }[]) => {
    fake.events.push(`upload ${files.map((f) => f.path).join(',')}`)
  })
  fake.sandbox.commands.run.mockImplementation(async (command: string) => {
    fake.events.push(`run ${command}`)
    const stdout = answer(command)
    return {
      disconnect: vi.fn(async () => {}),
      kill: vi.fn(async () => true),
      wait: async () => ({ exitCode: 0, stdout, stderr: '' }),
    }
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('withRecordingDesktop', () => {
  it('reads the versions, then uploads every file, before handing the sandbox over', async () => {
    const seen = await withRecordingDesktop(
      {
        source: null,
        files: () => [{ path: '/home/user/.statuslines/step-0.txt', data: '/radar' }],
      },
      async (_desktop, versions) => {
        fake.events.push('use')
        return versions
      },
    )

    expect(seen).toEqual({ desktopVersion: '2.31226.1', engineVersion: '2.1.295' })
    const upload = fake.events.findIndex((e) => e.startsWith('upload'))
    expect(fake.events.findIndex((e) => e.includes('dpkg-query'))).toBeLessThan(upload)
    expect(fake.events.findIndex((e) => e.includes('engine-version'))).toBeLessThan(upload)
    expect(upload).toBeLessThan(fake.events.indexOf('use'))
    expect(fake.events.at(-1)).toBe('kill')
  })

  it('gives the session no way to upload once it is running', async () => {
    await withRecordingDesktop({ source: null, files: () => [] }, async (desktop) => {
      expect(Object.keys(desktop).sort()).toEqual(['pluginDir', 'readPng', 'run', 'start'])
    })
  })

  it("prints the shot through a command run as the user, never envd's file read", async () => {
    const png = await withRecordingDesktop({ source: null, files: () => [] }, (desktop) =>
      desktop.readPng('import -window root -strip png:-'),
    )

    expect(png).toEqual(PNG)
    expect(fake.sandbox.files.read).not.toHaveBeenCalled()
    const call = fake.sandbox.commands.run.mock.calls.find(([c]) => String(c).includes('base64'))
    expect(call?.[1]).toMatchObject({ user: 'user' })
  })

  it('opens the Desktop template offline and in secure mode', async () => {
    await withRecordingDesktop({ source: null, files: () => [] }, async () => {})

    expect(fake.create).toHaveBeenCalledWith(
      E2B_DESKTOP_TEMPLATE_ID,
      expect.objectContaining({ allowInternetAccess: false, secure: true }),
    )
  })
})

describe('withAnalysisSandbox', () => {
  it('opens a fresh Desktop template sandbox, offline, and kills it afterwards', async () => {
    await withAnalysisSandbox(async (analysis) => {
      await analysis.writeFiles([{ path: '/home/user/.statuslines/shot.png', data: PNG }])
    })

    expect(fake.create).toHaveBeenCalledWith(
      E2B_DESKTOP_TEMPLATE_ID,
      expect.objectContaining({ allowInternetAccess: false, secure: true }),
    )
    expect(fake.events).toEqual(['upload /home/user/.statuslines/shot.png', 'kill'])
  })
})
