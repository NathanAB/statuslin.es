import type { Recording } from './recorder'
import { TERMINAL } from './session'

export const RECORDING_MAX_ROWS = TERMINAL.rows
/** A truecolor foreground and background on every cell of a row fits with room to spare. */
export const RECORDING_MAX_ROW_BYTES = 8 * 1024
export const RECORDING_MAX_BYTES = 128 * 1024

/** A recording is sandbox output, so its size is checked before anything parses or stores it. */
export function boundRecording(recording: Recording): Recording {
  const { rows } = recording
  if (rows.length > RECORDING_MAX_ROWS) {
    throw new Error(`recording has ${rows.length} rows, over the ${RECORDING_MAX_ROWS} limit`)
  }
  let total = 0
  for (const [i, row] of rows.entries()) {
    const bytes = Buffer.byteLength(row, 'utf8')
    if (bytes > RECORDING_MAX_ROW_BYTES) {
      throw new Error(`recording row ${i + 1} is over the ${RECORDING_MAX_ROW_BYTES}-byte limit`)
    }
    total += bytes
    if (total > RECORDING_MAX_BYTES) {
      throw new Error(`recording is over the ${RECORDING_MAX_BYTES}-byte limit`)
    }
  }
  return recording
}
