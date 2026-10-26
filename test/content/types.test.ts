import { describe, expect, it } from 'vitest'
import {
  configPageCopySchema,
  FAQ_ANSWER_MAX_CHARS,
  FAQ_QUESTION_MAX_CHARS,
  HEADLINE_MAX_CHARS,
  MAX_FAQ,
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

describe('mod page copy search fields', () => {
  const FAQ = [
    {
      question: 'Does the prompt cache expire between turns?',
      answer: 'Yes, after five minutes without a request.',
    },
  ]
  const SEARCH_COPY = { ...MOD_COPY, headline: "Keep Claude Code's prompt cache warm", faq: FAQ }

  it('accept a headline and FAQ on mod copy, and mod copy without them', () => {
    expect(modPageCopySchema.parse(SEARCH_COPY)).toEqual(SEARCH_COPY)
    expect(modPageCopySchema.parse(MOD_COPY)).toEqual(MOD_COPY)
  })

  it('accept them at every cap', () => {
    const full = {
      ...MOD_COPY,
      headline: 'h'.repeat(HEADLINE_MAX_CHARS),
      faq: Array.from({ length: MAX_FAQ }, (_, i) => ({
        question: `${i}`.padEnd(FAQ_QUESTION_MAX_CHARS, 'q'),
        answer: 'a'.repeat(FAQ_ANSWER_MAX_CHARS),
      })),
    }
    expect(modPageCopySchema.parse(full)).toEqual(full)
  })

  it('cap the headline, the FAQ entries and their length, and refuse an em dash', () => {
    const over = (max: number) => 'x'.repeat(max + 1)
    const entry = (question: string, answer: string) => ({
      ...SEARCH_COPY,
      faq: [{ question, answer }],
    })
    fails(modPageCopySchema, { ...SEARCH_COPY, headline: over(HEADLINE_MAX_CHARS) })
    fails(modPageCopySchema, {
      ...SEARCH_COPY,
      faq: Array.from({ length: MAX_FAQ + 1 }, (_, i) => ({ question: `Q${i}?`, answer: 'A.' })),
    })
    fails(modPageCopySchema, entry(over(FAQ_QUESTION_MAX_CHARS), 'A.'))
    fails(modPageCopySchema, entry('Q?', over(FAQ_ANSWER_MAX_CHARS)))
    fails(modPageCopySchema, entry('Q?', 'Warm — always.'))
  })

  it('stay off status line copy', () => {
    fails(configPageCopySchema, { ...CONFIG_COPY, headline: 'Show the branch' })
    fails(configPageCopySchema, { ...CONFIG_COPY, faq: [] })
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
