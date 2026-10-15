// Default import on purpose: under this repo's test runner (vitest via `bun --bun`), zod's
// named `z` export resolves to undefined at runtime; the default export works everywhere.
// Verified 2026-07-02 — don't "fix" this to `import { z } from 'zod'`.
import z from 'zod'

export const SUMMARY_MAX_CHARS = 200
export const MAX_STEPS = 4
export const STEP_MAX_CHARS = 90
export const MAX_NOTES = 3
export const NOTE_MAX_CHARS = 110
export const TILE_DETAIL_MAX_CHARS = 60
export const MAX_COMMANDS = 6

/**
 * One line of page copy: trimmed, non-empty and capped, since source text can steer the
 * copy-writing agent toward long text. Backticks mark code.
 */
function copyLine(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/[\r\n]/.test(text), 'must be one line')
    .refine((text) => !text.includes('—'), 'no em dash: use a comma or two sentences')
}

const pageCopyFields = {
  summary: copyLine(SUMMARY_MAX_CHARS),
  howItWorks: z.array(copyLine(STEP_MAX_CHARS)).max(MAX_STEPS),
  goodToKnow: z.array(copyLine(NOTE_MAX_CHARS)).max(MAX_NOTES),
}

const tileDetail = copyLine(TILE_DETAIL_MAX_CHARS).optional()

/**
 * The generated page copy for one status line version, stored in
 * config_versions.generated_content and shown in the "What it does" card
 * (src/gallery/what-it-does.tsx). `details` words a fact tile; the fact itself never comes
 * from here.
 */
export const configPageCopySchema = z.strictObject({
  ...pageCopyFields,
  details: z.strictObject({ readsClaudeLogin: tileDetail }).default({}),
})

/** A mod version's page copy, stored in mod_versions.generated_content. */
export const modPageCopySchema = z.strictObject({
  ...pageCopyFields,
  details: z
    .strictObject({
      showsUp: tileDetail,
      /** Used only when the footprint records commands without their names. */
      commands: z
        .array(z.string().regex(/^\/[\w:-]+$/, 'must be a slash command such as /burn'))
        .min(1)
        .max(MAX_COMMANDS)
        .optional(),
      usesYourPlan: tileDetail,
      changesFiles: tileDetail,
      network: tileDetail,
    })
    .default({}),
})

export type ConfigPageCopy = z.infer<typeof configPageCopySchema>
export type ModPageCopy = z.infer<typeof modPageCopySchema>
/** The part of the copy every page shows the same way. */
export type PageCopy = Pick<ConfigPageCopy, 'summary' | 'howItWorks' | 'goodToKnow'>

/**
 * Stored page copy in the current format, or null. Copy stored in an older format, or a
 * malformed value, never renders, and `generate:content --all --prepare` lists it as missing.
 */
export function readPageCopy<T>(schema: z.ZodType<T>, stored: unknown): T | null {
  const result = schema.safeParse(stored)
  return result.success ? result.data : null
}
