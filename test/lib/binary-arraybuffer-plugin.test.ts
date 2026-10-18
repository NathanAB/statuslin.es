import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { binaryArrayBuffer } from '@/lib/binary-arraybuffer-plugin'

const FONT = resolve('src/og/fonts/dejavu-sans-mono.ttf')

describe('binaryArrayBuffer', () => {
  it('loads an id another instance resolved', () => {
    // Vitest's module cache serves the importer with the id already resolved, so on a warm run
    // load sees the id without this process ever calling resolveId.
    const id = binaryArrayBuffer().resolveId(`${FONT}?arraybuffer`)
    if (id === null) throw new Error('expected the ?arraybuffer import to resolve')
    expect(binaryArrayBuffer().load(id)).toBe(
      `export default Buffer.from("${readFileSync(FONT).toString('base64')}", "base64")`,
    )
  })

  it('leaves other ids to the rest of the pipeline', () => {
    expect(binaryArrayBuffer().resolveId(FONT)).toBeNull()
    expect(binaryArrayBuffer().load(FONT)).toBeNull()
  })
})
