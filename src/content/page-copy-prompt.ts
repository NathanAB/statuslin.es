import {
  MAX_NOTES,
  MAX_STEPS,
  NOTE_MAX_CHARS,
  STEP_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  TILE_DETAIL_MAX_CHARS,
} from './types'

/** How every generated page-copy string reads, for configs and mods alike. */
export const COPY_STYLE_RULES = `- Every string is plain English on one line. No markdown, except backticks around code, commands, file names and settings keys (\`jq\`, \`/burn\`, \`CLAUDE.md\`).
- Write "status line" as two words in any prose.
- Be concrete: name the actual field, command, file or service. Leave out anything a reader could not check or act on.
- If a list has nothing observable, return an empty array for it.
- Write like a person, not a press release. No em dash (—) anywhere; use a comma, parentheses, or two sentences instead.
- Never use these words: delve, leverage, robust, comprehensive, seamless, crucial, pivotal, foster, streamline, elevate, utilize, empower.
- Vary how items start and how long they run; do not open several items with the same word or force everything into the same shape.`

/** One fact tile the copy may word, with what its wording should say. */
export interface TileDetailAsk {
  key: string
  type: 'string' | 'string[]'
  says: string
}

/**
 * The output instructions both kinds of page copy share: the JSON shape, each part's length
 * cap (from the schema's constants), and the tile wording keys that apply to this page.
 */
export function pageCopyTask(ask: {
  steps: string
  notes: string
  details: TileDetailAsk[]
}): string {
  const shape =
    ask.details.length > 0
      ? `{ ${ask.details.map((d) => `"${d.key}"?: ${d.type}`).join(', ')} }`
      : '{}'
  const details =
    ask.details.length > 0
      ? `- details: optional wording for the page's fact tiles, each string at most ${TILE_DETAIL_MAX_CHARS} characters. statuslin.es decides every yes or no from its own checks, so only word a fact listed here, and leave a key out when you have nothing concrete to add.
${ask.details.map((d) => `  - ${d.key}: ${d.says}`).join('\n')}`
      : '- details: return an empty object {}.'
  return `Return ONLY a JSON object, no prose before or after it and no markdown fences, with exactly these keys:

{
  "summary": string,
  "howItWorks": string[],
  "goodToKnow": string[],
  "details": ${shape}
}

- summary: 1 or 2 plain sentences, at most ${SUMMARY_MAX_CHARS} characters, saying what a user sees and what it is for.
- howItWorks: up to ${MAX_STEPS} steps, each at most ${STEP_MAX_CHARS} characters, in order: ${ask.steps}
- goodToKnow: up to ${MAX_NOTES} notes, each at most ${NOTE_MAX_CHARS} characters: ${ask.notes} Leave out what the fact tiles already state.
${details}`
}
