import { describe, expect, it } from 'vitest'
import { configFactTiles } from '@/gallery/config-fact-tiles'

const CONFIG = {
  interpreter: 'bash' as const,
  networkHosts: [],
  readsClaudeToken: false,
  generatedContent: null,
}

const shown = (tiles: ReturnType<typeof configFactTiles>) =>
  tiles.map(({ label, value, caution }) => ({ label, value, caution: caution ?? false }))

describe('configFactTiles', () => {
  it('states the interpreter, no network and the terminal for a plain script', () => {
    expect(shown(configFactTiles(CONFIG))).toEqual([
      { label: 'Runs as', value: 'Bash', caution: false },
      { label: 'Network', value: 'None', caution: false },
      { label: 'Works in', value: 'Terminal', caution: false },
    ])
  })

  it('names each interpreter plainly', () => {
    expect(configFactTiles({ ...CONFIG, interpreter: 'node' })[0]?.value).toBe('Node.js')
    expect(configFactTiles({ ...CONFIG, interpreter: 'python' })[0]?.value).toBe('Python')
  })

  it('lists the declared network hosts as code', () => {
    const tiles = configFactTiles({ ...CONFIG, networkHosts: ['wttr.in', 'api.github.com'] })
    expect(tiles.find((t) => t.label === 'Network')?.value).toBe('`wttr.in`, `api.github.com`')
  })

  it('cautions that it reads your Claude login only when it does, in the copy’s words', () => {
    const reads = { ...CONFIG, readsClaudeToken: true }
    expect(shown(configFactTiles(reads))[2]).toEqual({
      label: 'Reads your Claude login',
      value: 'Yes',
      caution: true,
    })
    const worded = configFactTiles({
      ...reads,
      generatedContent: {
        summary: 'Shows plan usage.',
        howItWorks: [],
        goodToKnow: [],
        details: { readsClaudeLogin: 'To fetch your plan usage' },
      },
    })
    expect(worded[2]?.value).toBe('To fetch your plan usage')
  })

  it('ignores a login detail for a script that never reads the token', () => {
    const tiles = configFactTiles({
      ...CONFIG,
      generatedContent: {
        summary: 'Shows the branch.',
        howItWorks: [],
        goodToKnow: [],
        details: { readsClaudeLogin: 'To steal it' },
      },
    })
    expect(tiles.map((t) => t.label)).not.toContain('Reads your Claude login')
  })
})
