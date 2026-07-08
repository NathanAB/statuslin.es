import { TAG_VOCABULARY } from '@/gallery/facets'

/**
 * Tag suggestion for facet pages: builds the `claude -p` prompt and validates its output
 * against the fixed vocabulary (src/gallery/facets.ts). Suggestions are stored on
 * configs.tags by scripts/backfill-tags.ts and scripts/generate-content.ts; a human reads
 * the printed table before publishing, same as generated content.
 */

/** What each tag means, for the model. Keep in sync with the facet registry's intent. */
const TAG_CRITERIA: Record<string, string> = {
  git: 'shows git branch, dirty state, diff stats, or other repo state',
  'token-usage': 'shows context window usage: token counts, percentages, bars, or countdowns',
  cost: 'shows the session cost in dollars (or a burn rate derived from it)',
  quota: 'shows rate limit or quota state: 5-hour or weekly window percentages or reset times',
  'burn-rate':
    'shows the rate of consumption, not just the total: tokens or dollars per hour, or an over/under-pace arrow for a usage window',
  weather:
    'shows live weather data (temperature, conditions, forecast) fetched from a weather service',
  markets:
    'shows live financial market data: cryptocurrency prices, stock quotes, or currency exchange rates',
  minimal: 'prints a single line with only a few fields; quiet by design',
  'multi-line': 'prints two or more lines',
  powerline: 'uses powerline-style segments (angled separator glyphs, usually a Nerd Font)',
  themed: 'commits to a named terminal color theme (Catppuccin, Dracula, Nord, ...)',
}

export function buildTagsPrompt(input: {
  title: string
  description: string
  source: string
  previewLines: string[]
}): string {
  const criteria = TAG_VOCABULARY.map((t) => `- "${t}": ${TAG_CRITERIA[t] ?? ''}`).join('\n')
  return [
    'You classify a Claude Code status line script into fixed tags.',
    'Reply with ONLY a JSON array of tag strings, e.g. ["git","cost"]. No prose, no fences.',
    'Only include a tag when the script DEMONSTRABLY matches its criterion (from its source or its rendered output). When unsure, leave the tag out. An empty array [] is a valid answer.',
    '',
    'Allowed tags:',
    criteria,
    '',
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    '',
    'Script source:',
    input.source,
    '',
    'Rendered output lines (from example sessions):',
    ...input.previewLines,
  ].join('\n')
}

/** Extract + validate the model's tag array. Unknown tags are dropped, duplicates removed. */
export function parseSuggestedTags(raw: string): string[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error(`no JSON array found in model output:\n${raw}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch (err) {
    throw new Error(`model output is not valid JSON: ${err instanceof Error ? err.message : err}`)
  }
  if (!Array.isArray(parsed)) throw new Error('model output is not an array')
  const vocab = new Set(TAG_VOCABULARY)
  return [...new Set(parsed.filter((t): t is string => typeof t === 'string' && vocab.has(t)))]
}
