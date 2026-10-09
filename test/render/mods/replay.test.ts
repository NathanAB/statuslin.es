import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROW_MAX_BYTES, replayScreen, SCREEN_MAX_BYTES } from '@/render/mods/replay'
import { TERMINAL } from '@/render/mods/session'
import styledRows from './fixtures/styled-session.rows.json'

const bytes = (text: string) => new TextEncoder().encode(text)

/** One cell per column, each with its own truecolor pair and every flag: the longest a row styles. */
function mostStyledRow(seed: number): string {
  let row = ''
  for (let x = 0; x < TERMINAL.cols; x++) {
    const c = (seed + x) % 250
    row += `\u001b[1;2;3;4;38;2;${c};${c + 1};${c + 2};48;2;${c + 3};${c + 4};${c + 5}m█`
  }
  return row
}

describe('replayScreen', () => {
  it('gives the styled rows the in-sandbox replay gave for the same byte stream', async () => {
    const recording = readFileSync(join(import.meta.dirname, 'fixtures/styled-session.ansi'))

    expect(await replayScreen(recording)).toEqual(styledRows)
  })

  it('gives one row per terminal row for an empty recording', async () => {
    expect(await replayScreen(new Uint8Array())).toEqual(Array(TERMINAL.rows).fill(''))
  })

  it('keeps a row restyled at every cell', async () => {
    const [row] = await replayScreen(bytes(mostStyledRow(0)))

    expect(Buffer.byteLength(row ?? '')).toBeGreaterThan(4_000)
    expect(Buffer.byteLength(row ?? '')).toBeLessThanOrEqual(ROW_MAX_BYTES)
  })

  it('refuses a row piled with combining marks', async () => {
    const recording = bytes(`\u001b[2;1He${'\u0301'.repeat(ROW_MAX_BYTES)}`)

    await expect(replayScreen(recording)).rejects.toThrow(`row 2 is over ${ROW_MAX_BYTES} bytes`)
  })

  it('refuses a screen over the total cap even when every row is under its own', async () => {
    const screen = Array.from({ length: TERMINAL.rows - 1 }, (_, y) => mostStyledRow(y)).join(
      '\r\n',
    )

    await expect(replayScreen(bytes(screen))).rejects.toThrow(
      `screen is over ${SCREEN_MAX_BYTES} bytes`,
    )
  })
})
