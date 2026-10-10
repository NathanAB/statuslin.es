import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'
import { RECORDING_MAX_BYTES, RECORDING_MAX_ROW_BYTES } from '@/render/mods/bound-recording'
import type { CommandOutput, ReplaySandbox } from '@/render/mods/mod-sandbox'
import {
  parseScreen,
  REPLAY_OUTPUT_MAX_BYTES,
  REPLAY_SCRIPT_SRC,
  replayInSandbox,
} from '@/render/mods/replay'
import { TERMINAL } from '@/render/mods/session'
import styledRows from './fixtures/styled-session.rows.json'

const bytes = (text: string) => new TextEncoder().encode(text)
const HOST_XTERM_DIR = join(import.meta.dirname, '../../../node_modules/@xterm/headless')
const scratch = mkdtempSync(join(tmpdir(), 'replay-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** Trusted fixture bytes only: the script runs on the host here. */
async function replayScript(recording: Uint8Array): Promise<string[]> {
  const path = join(scratch, `${performance.now()}.bin`)
  writeFileSync(path, recording)
  const { stdout } = await promisify(execFile)('node', [
    REPLAY_SCRIPT_SRC,
    HOST_XTERM_DIR,
    path,
    String(TERMINAL.cols),
    String(TERMINAL.rows),
  ])
  return JSON.parse(stdout)
}

/** One cell per column, each with its own truecolor pair and every flag: the longest a row styles. */
function mostStyledRow(seed: number): string {
  let row = ''
  for (let x = 0; x < TERMINAL.cols; x++) {
    const c = (seed + x) % 250
    row += `\u001b[1;2;3;4;38;2;${c};${c + 1};${c + 2};48;2;${c + 3};${c + 4};${c + 5}m█`
  }
  return row
}

describe('the sandbox replay script', () => {
  it('gives the styled rows the earlier replays gave for the same byte stream', async () => {
    const recording = readFileSync(join(import.meta.dirname, 'fixtures/styled-session.ansi'))

    expect(await replayScript(recording)).toEqual(styledRows)
  })

  it('gives one row per terminal row for an empty recording', async () => {
    expect(await replayScript(new Uint8Array())).toEqual(Array(TERMINAL.rows).fill(''))
  })

  it('draws an inverse cell with default colours as black on white', async () => {
    const [row] = await replayScript(bytes('\u001b[7mX'))

    expect(row).toBe('\u001b[0;30;47mX\u001b[0m')
  })

  it('repeats the preceding character as a terminal does', async () => {
    const [row] = await replayScript(bytes('ab\u001b[3b'))

    expect(row).toBe('abbbb')
  })

  it('keeps a row restyled at every cell inside the row cap', async () => {
    const [row] = await replayScript(bytes(mostStyledRow(0)))

    expect(Buffer.byteLength(row ?? '')).toBeGreaterThan(4_000)
    expect(Buffer.byteLength(row ?? '')).toBeLessThanOrEqual(RECORDING_MAX_ROW_BYTES)
  })
})

describe('parseScreen', () => {
  it('reads the rows the script printed', () => {
    expect(parseScreen(JSON.stringify(styledRows))).toEqual(styledRows)
  })

  it('checks the size before parsing', () => {
    const oversized = `[${'"x",'.repeat(REPLAY_OUTPUT_MAX_BYTES / 4)}"x"]`

    expect(() => parseScreen(oversized)).toThrow(
      `replay output is over the ${REPLAY_OUTPUT_MAX_BYTES}-byte limit`,
    )
    expect(() => parseScreen('{'.repeat(REPLAY_OUTPUT_MAX_BYTES + 1))).toThrow(
      `replay output is over the ${REPLAY_OUTPUT_MAX_BYTES}-byte limit`,
    )
  })

  it('never refuses a screen inside the recording caps', () => {
    const row = '\u001b'.repeat(RECORDING_MAX_BYTES / TERMINAL.rows)
    const rows = Array.from({ length: TERMINAL.rows }, () => row)

    expect(parseScreen(JSON.stringify(rows))).toEqual(rows)
  })

  it('refuses output that is not a list of rows', () => {
    expect(() => parseScreen('{"rows":[]}')).toThrow()
    expect(() => parseScreen('[1,2]')).toThrow()
  })
})

function fakeReplaySandbox(result: () => Promise<CommandOutput>) {
  const uploads: { path: string; data: string | Uint8Array }[] = []
  const commands: string[] = []
  const sandbox: ReplaySandbox = {
    writeFiles: async (files) => {
      uploads.push(...files)
    },
    runBounded: async (command) => {
      commands.push(command)
      return result()
    },
  }
  return { sandbox, uploads, commands }
}

describe('replayInSandbox', () => {
  const pty = bytes('\u001b[2J\u001b[Hhello')

  it('uploads the pty bytes and the script, and returns the rows the sandbox printed', async () => {
    const printed = ['from the sandbox', '']
    const fake = fakeReplaySandbox(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(printed),
      stderr: '',
    }))

    expect(await replayInSandbox(fake.sandbox, pty)).toEqual(printed)
    expect(fake.uploads.map((u) => u.data)).toEqual([pty, readFileSync(REPLAY_SCRIPT_SRC, 'utf8')])
    expect(fake.commands).toHaveLength(1)
  })

  it('fails the recording when the replay exits non-zero', async () => {
    const fake = fakeReplaySandbox(async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'RangeError: Out of memory',
    }))

    await expect(replayInSandbox(fake.sandbox, pty)).rejects.toThrow(
      'replay exited 1: RangeError: Out of memory',
    )
  })

  it('fails the recording when the replay runs out of time', async () => {
    const fake = fakeReplaySandbox(async () => {
      throw new Error('command ran past 20000 ms')
    })

    await expect(replayInSandbox(fake.sandbox, pty)).rejects.toThrow('command ran past 20000 ms')
  })

  it('fails the recording when the replay prints too much', async () => {
    const fake = fakeReplaySandbox(async () => ({
      exitCode: 0,
      stdout: '"'.repeat(REPLAY_OUTPUT_MAX_BYTES + 1),
      stderr: '',
    }))

    await expect(replayInSandbox(fake.sandbox, pty)).rejects.toThrow(
      `replay output is over the ${REPLAY_OUTPUT_MAX_BYTES}-byte limit`,
    )
  })

  it('caps the error text a failed replay prints', async () => {
    const fake = fakeReplaySandbox(async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'x'.repeat(100_000),
    }))

    const error = await replayInSandbox(fake.sandbox, pty).catch((e: Error) => e)

    expect((error as Error).message.length).toBeLessThan(1_000)
  })
})
