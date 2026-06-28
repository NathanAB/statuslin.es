import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { Interpreter } from '@/render/types'

// Server-only. Shiki turns a submitted script into highlighted HTML at render time, so the
// client only ships the resulting (already-escaped) markup — no Shiki in the browser bundle.

const THEME = 'github-dark-default'

// Our three interpreters → the Shiki grammar that fits each.
const INTERPRETER_LANG: Record<Interpreter, string> = {
  bash: 'bash',
  node: 'javascript',
  python: 'python',
}

// Fine-grained bundle: only the three grammars + one theme + the JS regex engine (no wasm).
let highlighterPromise: Promise<HighlighterCore> | null = null
function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark-default')],
      langs: [
        import('@shikijs/langs/bash'),
        import('@shikijs/langs/javascript'),
        import('@shikijs/langs/python'),
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

// Cap the source we hand to Shiki. Its grammar tokenizer is synchronous and the bash grammar is
// ~quadratic on pathological input — a 100KB run blocks the event loop for ~14s. Legit statuslines
// are a few KB; above this we render escaped plain text instead (instant, and still safe to inject).
const HIGHLIGHT_MAX_BYTES = 20_000

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Escaped, unhighlighted `<pre>` for oversized source — the same shape the detail page injects,
 *  minus the Shiki work. Keeps the `.shiki` class so the container styling still applies. */
function plainPre(source: string): string {
  return `<pre class="shiki"><code>${escapeHtml(source)}</code></pre>`
}

/** Render a submitted script to syntax-highlighted HTML. Shiki escapes the code text, so the
 *  output is safe to inject. Styling lives in the `.shiki` rule in src/styles/app.css.
 *  Oversized source (> HIGHLIGHT_MAX_BYTES) is returned as escaped plain text — see the constant. */
export async function highlightSource(source: string, interpreter: Interpreter): Promise<string> {
  if (source.length > HIGHLIGHT_MAX_BYTES) return plainPre(source)
  const highlighter = await getHighlighter()
  return highlighter.codeToHtml(source, {
    lang: INTERPRETER_LANG[interpreter],
    theme: THEME,
    transformers: [
      {
        // Drop Shiki's inline theme background so the `.shiki` rule (our --sunken) wins
        // without needing !important.
        pre(node) {
          if (typeof node.properties.style === 'string') {
            node.properties.style = node.properties.style.replace(/background-color:[^;]*;?/, '')
          }
        },
      },
    ],
  })
}

/** Best-effort highlight for the write path: returns null instead of throwing, so a highlight
 *  failure can never block a submission or a backfill. A null result falls back to live
 *  highlighting on read (see `resolveSourceHtml`). */
export async function tryHighlightSource(
  source: string,
  interpreter: Interpreter,
): Promise<string | null> {
  try {
    return await highlightSource(source, interpreter)
  } catch {
    return null
  }
}

/** Read path: use the pre-highlighted HTML stored on the version if present, else highlight live.
 *  Lets the detail page skip Shiki entirely once a version's `source_html` is populated. */
export async function resolveSourceHtml(
  stored: string | null,
  source: string,
  interpreter: Interpreter,
): Promise<string> {
  return stored ?? (await highlightSource(source, interpreter))
}
