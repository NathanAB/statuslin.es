import { describe, expect, it } from 'vitest'
import {
  boundRecording,
  RECORDING_MAX_BYTES,
  RECORDING_MAX_ROW_BYTES,
  RECORDING_MAX_ROWS,
} from '@/render/mods/bound-recording'
import tokenWeather from './fixtures/token-weather.json'

const recording = (rows: string[]) => ({ rows, claudeCodeVersion: '2.1.296' })

describe('boundRecording', () => {
  it('passes a real recording through unchanged', () => {
    expect(boundRecording(recording(tokenWeather))).toEqual(recording(tokenWeather))
  })

  it('refuses more rows than the terminal has', () => {
    const rows = Array.from({ length: RECORDING_MAX_ROWS + 1 }, () => 'x')
    expect(() => boundRecording(recording(rows))).toThrow(
      `recording has ${RECORDING_MAX_ROWS + 1} rows, over the ${RECORDING_MAX_ROWS} limit`,
    )
  })

  it('refuses a row longer than the row cap, counted in UTF-8 bytes', () => {
    const row = '█'.repeat(Math.ceil(RECORDING_MAX_ROW_BYTES / 3) + 1)
    expect(() => boundRecording(recording(['', row]))).toThrow(
      `recording row 2 is over the ${RECORDING_MAX_ROW_BYTES}-byte limit`,
    )
  })

  it('refuses a screen whose rows together pass the total cap', () => {
    const row = 'x'.repeat(RECORDING_MAX_ROW_BYTES)
    const rows = Array.from(
      { length: Math.floor(RECORDING_MAX_BYTES / RECORDING_MAX_ROW_BYTES) + 1 },
      () => row,
    )
    expect(() => boundRecording(recording(rows))).toThrow(
      `recording is over the ${RECORDING_MAX_BYTES}-byte limit`,
    )
  })
})
