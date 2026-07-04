// Default import on purpose: under this repo's test runner (vitest via `bun --bun`), zod's
// named `z` export resolves to undefined at runtime; the default export works everywhere.
// Verified 2026-07-02 — don't "fix" this to `import { z } from 'zod'`.
import z from 'zod'

/**
 * The auto-generated page copy for one config version — exactly three sections, each a list of
 * short plain-English items. Produced by scripts/generate-content.ts (claude -p) and stored in
 * config_versions.generated_content; rendered by src/gallery/generated-content.tsx.
 */
export const generatedContentSchema = z.object({
  whatItShows: z.array(z.string().min(1)),
  requirements: z.array(z.string().min(1)),
  behaviorNotes: z.array(z.string().min(1)),
})

export type GeneratedContent = z.infer<typeof generatedContentSchema>

/**
 * Turn raw model output into a validated GeneratedContent, or throw with a message that says
 * exactly what was wrong. Models sometimes wrap JSON in markdown fences or stray prose despite
 * being told not to, so this extracts the outermost {...} instead of parsing the whole string.
 * Unknown keys are stripped (zod object default), so only the three sections are ever stored.
 */
export function parseGeneratedContent(raw: string): GeneratedContent {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error(`no JSON object found in model output:\n${raw}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (err) {
    throw new Error(`model output is not valid JSON: ${err instanceof Error ? err.message : err}`)
  }
  const result = generatedContentSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`model output failed validation:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
