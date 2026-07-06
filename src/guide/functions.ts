import { createServerFn } from '@tanstack/react-start'
import { MINIMAL_SCRIPT, SAMPLE_STDIN_JSON, SETTINGS_SNIPPET } from '@/guide/examples'
import { highlightSource } from '@/lib/highlight'

/**
 * Shiki-highlighted HTML for the /guide page's three code blocks. The inputs
 * (SAMPLE_STDIN_JSON, MINIMAL_SCRIPT, SETTINGS_SNIPPET) are module constants, so the
 * highlighted result is computed once per server process and reused for every request.
 */
let highlightsPromise: Promise<{
  payloadHtml: string
  scriptHtml: string
  settingsHtml: string
}> | null = null

function computeGuideHighlights() {
  if (!highlightsPromise) {
    highlightsPromise = Promise.all([
      highlightSource(SAMPLE_STDIN_JSON, 'json'),
      highlightSource(MINIMAL_SCRIPT, 'bash'),
      highlightSource(SETTINGS_SNIPPET, 'json'),
    ]).then(([payloadHtml, scriptHtml, settingsHtml]) => ({
      payloadHtml,
      scriptHtml,
      settingsHtml,
    }))
    // Don't cache a rejection: a failed first run would otherwise poison the module-level
    // cache and 500 every /guide request until a process restart. Reset so the next request
    // retries; the rejection itself still propagates to the caller that triggered it.
    highlightsPromise.catch(() => {
      highlightsPromise = null
    })
  }
  return highlightsPromise
}

export const getGuideHighlights = createServerFn({ method: 'GET' }).handler(() =>
  computeGuideHighlights(),
)
