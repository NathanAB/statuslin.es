import { describe, expect, it } from 'vitest'
import {
  configPageCopySchema,
  MAX_NOTES,
  MAX_STEPS,
  modPageCopySchema,
  NOTE_MAX_CHARS,
  readPageCopy,
  STEP_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  TILE_DETAIL_MAX_CHARS,
} from '@/content/types'

const CONFIG_COPY = {
  summary: 'Shows the git branch and how full the context window is.',
  howItWorks: ['Reads the session JSON Claude Code sends', 'Runs `git` for the branch'],
  goodToKnow: ['Needs `jq` on your PATH'],
  details: { readsClaudeLogin: 'To fetch your plan usage' },
}

const MOD_COPY = {
  summary: 'A burn meter above the prompt.',
  howItWorks: ['Counts tokens after each turn'],
  goodToKnow: [],
  details: {
    showsUp: 'A one-line meter above the prompt',
    commands: ['/burn'],
    usesYourPlan: 'Asks the model for a summary',
    changesFiles: '`CLAUDE.md`, only when you press Save',
    network: 'Weather from open-meteo.com',
  },
}

/** The old three-section format, still stored on versions generated before this one. */
const OLD_FORMAT = {
  whatItShows: ['Current git branch'],
  requirements: ['bash'],
  behaviorNotes: ['Branch disappears outside a repo'],
}

const fails = (schema: typeof configPageCopySchema | typeof modPageCopySchema, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(false)

describe('page copy schemas', () => {
  it('accept the status line and mod copy', () => {
    expect(configPageCopySchema.parse(CONFIG_COPY)).toEqual(CONFIG_COPY)
    expect(modPageCopySchema.parse(MOD_COPY)).toEqual(MOD_COPY)
  })

  it('give copy without tile details an empty set of them', () => {
    const { details: _details, ...bare } = CONFIG_COPY
    expect(configPageCopySchema.parse(bare).details).toEqual({})
  })

  it('refuse the old three-section format', () => {
    fails(configPageCopySchema, OLD_FORMAT)
    fails(modPageCopySchema, OLD_FORMAT)
  })

  it('refuse keys outside the format, at the top and among the tile details', () => {
    fails(configPageCopySchema, { ...CONFIG_COPY, whatItShows: ['x'] })
    fails(configPageCopySchema, { ...CONFIG_COPY, details: { changesFiles: 'x' } })
    fails(modPageCopySchema, { ...MOD_COPY, details: { readsClaudeLogin: 'x' } })
  })

  it('cap the summary, steps, notes and tile details', () => {
    const over = (max: number) => 'x'.repeat(max + 1)
    fails(configPageCopySchema, { ...CONFIG_COPY, summary: over(SUMMARY_MAX_CHARS) })
    fails(configPageCopySchema, { ...CONFIG_COPY, howItWorks: [over(STEP_MAX_CHARS)] })
    fails(configPageCopySchema, { ...CONFIG_COPY, goodToKnow: [over(NOTE_MAX_CHARS)] })
    fails(configPageCopySchema, {
      ...CONFIG_COPY,
      details: { readsClaudeLogin: over(TILE_DETAIL_MAX_CHARS) },
    })
    fails(configPageCopySchema, {
      ...CONFIG_COPY,
      howItWorks: Array.from({ length: MAX_STEPS + 1 }, () => 'step'),
    })
    fails(configPageCopySchema, {
      ...CONFIG_COPY,
      goodToKnow: Array.from({ length: MAX_NOTES + 1 }, () => 'note'),
    })
  })

  it('accept copy at every cap', () => {
    const full = {
      summary: 's'.repeat(SUMMARY_MAX_CHARS),
      howItWorks: Array.from({ length: MAX_STEPS }, () => 'h'.repeat(STEP_MAX_CHARS)),
      goodToKnow: Array.from({ length: MAX_NOTES }, () => 'g'.repeat(NOTE_MAX_CHARS)),
      details: { readsClaudeLogin: 'd'.repeat(TILE_DETAIL_MAX_CHARS) },
    }
    expect(configPageCopySchema.parse(full)).toEqual(full)
  })

  it('refuse an empty summary, a line break and an em dash', () => {
    fails(configPageCopySchema, { ...CONFIG_COPY, summary: '   ' })
    fails(configPageCopySchema, { ...CONFIG_COPY, howItWorks: ['one\ntwo'] })
    fails(configPageCopySchema, { ...CONFIG_COPY, goodToKnow: ['fast — and small'] })
  })

  it('take a mod command only as a slash command', () => {
    fails(modPageCopySchema, { ...MOD_COPY, details: { commands: ['burn'] } })
    fails(modPageCopySchema, { ...MOD_COPY, details: { commands: ['/burn now'] } })
  })
})

describe('readPageCopy', () => {
  it('returns stored copy in the current format', () => {
    expect(readPageCopy(modPageCopySchema, MOD_COPY)).toEqual(MOD_COPY)
  })

  it('returns null for nothing stored, the old format, or a malformed value', () => {
    expect(readPageCopy(configPageCopySchema, null)).toBeNull()
    expect(readPageCopy(configPageCopySchema, OLD_FORMAT)).toBeNull()
    expect(readPageCopy(modPageCopySchema, { summary: 42 })).toBeNull()
  })
})
