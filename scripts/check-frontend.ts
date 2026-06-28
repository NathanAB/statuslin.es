import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Files allowed to use inline styles — their colors come from data (script output)
 * or are a var()-only CSS bridge into a vendored component. */
const INLINE_STYLE_ALLOW = [
  'src/ui/statusline-preview.tsx',
  // var()-only CSS bridge to the vendored sonner toaster; the raw-color rule still
  // polices its contents, so it can carry tokens but never a literal.
  'src/ui/sonner.tsx',
]
/** Vendored shadcn primitives legitimately use arbitrary values (color-mix(), min(), …) that
 * tokens can't express. They're reviewed library code, so the arbitrary-value rule skips them;
 * app code (routes, features) stays strict. */
const VENDORED_UI = 'src/ui/'
const MAX_LINES = 250
const HEX = /#[0-9a-fA-F]{3,8}\b/
// Only flag rgb()/hsl() with a LITERAL digit after the paren, so runtime interpolation
// like `rgb(${c.fg})` (ANSI data from user scripts in src/render/ansi.ts) stays legal.
const RGB_HSL = /\b(?:rgb|hsl)a?\(\s*\d/
// A style={ prop in any wrapping the formatter might produce (style={{…}} on one line,
// or style={\n{…}\n} split across lines). The substring check missed the wrapped form.
const STYLE_PROP = /style=\{/
// Matches arbitrary Tailwind values like w-[437px] or text-[#fff].
// The trailing `(?!\s*:)` exempts arbitrary *variants* (which always end in a colon —
// data-[state=open]:, aria-[busy=true]:, supports-[display:grid]:), so we only flag
// arbitrary *values*. The lookbehind keeps the common variant prefixes from being split
// mid-token. NOTE: utility-name fragments like `cols`/`rows` are deliberately NOT exempt,
// so a real violation like grid-cols-[repeat(3,200px)] in app code is still caught.
const ARBITRARY_TW = /(?<!\b(?:data|aria|has|group|in|not|peer|slot))-\[[^\]]+\](?!\s*:)/
// Tailwind default-palette color classes. After `--color-*: initial` wipes the default
// palette, these utilities generate nothing — a class like bg-red-500 silently renders
// transparent. Flag them so they can't sneak in.
const DEAD_PALETTE =
  /\b(?:text|bg|border|ring|outline|fill|stroke|from|via|to|divide|decoration|caret|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
// Server-only entrypoint. Importing it into a client-shipped route module throws at hydration.
const SERVER_ONLY_IMPORT = /from\s+['"]@tanstack\/react-start\/server['"]/
const TOKENS_FILE = 'src/styles/app.css'
// Server-side image generation for satori, NOT browser UI. satori only understands inline styles
// and literal colors, so the design-system rules (inline-style, raw-color, dead-palette,
// arbitrary-Tailwind, font-family) don't apply here. Colors are guarded instead by the palette
// drift-test (test/og/palette.test.ts). Token-echo also skips it: restating a token value is the
// whole point of palette.ts.
const OG_DIR = 'src/og/'
// Generated files: never hand-written, exclude from the walk.
const GENERATED = ['routeTree.gen.ts', 'auth-schema.ts']

/** Normalize a hex literal: lowercase + expand 3/4-digit shorthand to 6/8 so
 * #ABC, #abc and #aabbcc all compare equal. */
export function normalizeHex(hex: string): string {
  const h = hex.toLowerCase()
  const body = h.slice(1)
  if (body.length === 3 || body.length === 4) {
    return `#${[...body].map((c) => c + c).join('')}`
  }
  return h
}

export function findViolations(path: string, content: string): string[] {
  if (path.startsWith(OG_DIR)) return []
  const out: string[] = []
  const isTsx = path.endsWith('.tsx')
  if (isTsx && STYLE_PROP.test(content) && !INLINE_STYLE_ALLOW.includes(path)) {
    out.push(`${path}: inline style is banned (use tokens/classes)`)
  }
  if (path !== TOKENS_FILE && (HEX.test(content) || RGB_HSL.test(content))) {
    out.push(`${path}: raw color literal is banned (use a token)`)
  }
  if (isTsx && DEAD_PALETTE.test(content)) {
    out.push(`${path}: Tailwind default-palette class is banned (palette is wiped — use a token)`)
  }
  if (isTsx && !path.startsWith(VENDORED_UI) && ARBITRARY_TW.test(content)) {
    out.push(`${path}: arbitrary Tailwind value is banned (use the scale/tokens)`)
  }
  if (content.split('\n').length > MAX_LINES) {
    out.push(`${path}: file exceeds ${MAX_LINES} lines (split it)`)
  }
  // Route modules ship to the client; importing the server-only entrypoint crashes hydration
  // (its client mock has no such exports). Server APIs belong inside createServerFn handlers in
  // feature modules, which the bundler strips from the client build.
  if (path.startsWith('src/routes/') && SERVER_ONLY_IMPORT.test(content)) {
    out.push(
      `${path}: server-only import '@tanstack/react-start/server' in a route file crashes hydration — call it inside a createServerFn handler in a feature module instead`,
    )
  }
  return out
}

// Matches a custom-property declaration whose value is a single hex literal:
//   --name: #aabbcc;   (var()/calc()/initial values don't match — they aren't a bare hex)
const TOKEN_DECL = /^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gm

/** Rule 1 — define-once: in the tokens file each color literal may be DEFINED at most
 * once across custom-property declarations. Duplicates (incl. shorthand vs long form)
 * must instead reference the first token by var(). var() lines never match TOKEN_DECL. */
export function findDuplicateTokenLiterals(css: string): string[] {
  const out: string[] = []
  const firstSeen = new Map<string, string>()
  for (const [, name, hex] of css.matchAll(TOKEN_DECL)) {
    if (!name || !hex) continue
    const literal = normalizeHex(hex)
    const prior = firstSeen.get(literal)
    if (prior) {
      out.push(
        `${name}: ${hex} duplicates ${prior}'s value — define by reference instead: var(${prior})`,
      )
    } else {
      firstSeen.set(literal, name)
    }
  }
  return out
}

// A --color-* theme-alias declaration and its value (up to the semicolon).
const THEME_ALIAS = /^\s*(--color-[\w*-]+)\s*:\s*([^;]+);/gm

/** Rule 2 — theme aliases: every `--color-*:` declaration must be `initial` or contain
 * var(). A literal value there forks the design system from its single source. */
export function findThemeAliasLiterals(css: string): string[] {
  const out: string[] = []
  for (const [, name, rawValue] of css.matchAll(THEME_ALIAS)) {
    if (!name || rawValue === undefined) continue
    const value = rawValue.trim()
    if (value === 'initial' || value.includes('var(')) continue
    out.push(`${name}: theme alias must be 'initial' or var() — found literal '${value}'`)
  }
  return out
}

const ANY_HEX = /#[0-9a-fA-F]{3,8}\b/g

/** Rule 6 — token-echo: any color literal in src/ or test/ equal to a tokens-file value
 * must reference the token instead of restating the hex. */
export function findTokenEchoes(
  tokenLiterals: Set<string>,
  path: string,
  content: string,
): string[] {
  if (path === TOKENS_FILE || path.startsWith(OG_DIR)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const [hex] of content.matchAll(ANY_HEX)) {
    const norm = normalizeHex(hex)
    if (tokenLiterals.has(norm) && !seen.has(norm)) {
      seen.add(norm)
      out.push(`${path}: ${hex} duplicates a token value — reference the token`)
    }
  }
  return out
}

/** Collect the normalized hex literals DEFINED in the tokens file (declaration values
 * only — comments and var() refs are ignored). Drives the token-echo rule. */
export function tokenLiteralsOf(css: string): Set<string> {
  const set = new Set<string>()
  for (const [, , hex] of css.matchAll(TOKEN_DECL)) {
    if (hex) set.add(normalizeHex(hex))
  }
  return set
}

// Matches `className=` but NOT `UNSAFE_className=` (negative lookbehind on `UNSAFE_`).
const CLASSNAME_PROP = /(?<!UNSAFE_)className=/

/** Rule 2 (enforcement stack) — `className=` is banned outside `src/ui/`.
 * `UNSAFE_className=` occurrences are not flagged by this rule (rule 3 handles them).
 * Returns a violation string when a non-ui file contains plain `className=`. */
export function findClassNameOutsideUi(path: string, content: string): string[] {
  if (path.startsWith('src/ui/')) return []
  // Strip all UNSAFE_className= occurrences so the regex below can't match them
  // even on engines where the lookbehind has edge-case behaviour.
  const stripped = content.replace(/UNSAFE_className=/g, '')
  if (!CLASSNAME_PROP.test(stripped)) return []
  return [
    `${path}: className is banned outside src/ui — compose ui components and layout primitives; appearance belongs to the design system`,
  ]
}

// Matches a line that contains UNSAFE_className=
const UNSAFE_CLASSNAME_LINE = /UNSAFE_className=/
// Matches a line that is a // REASON: comment (whitespace-flexible)
const REASON_COMMENT = /^\s*\/\/ REASON:/

/** Rule 3 (enforcement stack) — every `UNSAFE_className=` line must have a `// REASON:`
 * comment on the immediately preceding line. Returns one violation per unguarded occurrence.
 * Only runs on `.tsx` files: in plain `.ts` files `UNSAFE_className=` can only appear as a
 * string literal (e.g. test fixtures), never as a JSX prop. */
export function findUnsafeClassNameWithoutReason(path: string, content: string): string[] {
  if (!path.endsWith('.tsx')) return []
  const lines = content.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!UNSAFE_CLASSNAME_LINE.test(lines[i] ?? '')) continue
    const prevLine = i > 0 ? (lines[i - 1] ?? '') : ''
    if (!REASON_COMMENT.test(prevLine)) {
      out.push(
        `${path}: UNSAFE_className requires a // REASON: comment on the preceding line explaining why the design system can't cover this`,
      )
    }
  }
  return out
}

// Files allowed to set a font-family class. Everything else renders text through the
// typography components (Text/Heading), so the family lives in exactly one place — the
// same model as "raw hex only in app.css". This is what catches a stray second font or
// a typo like `font-heading` (an undefined family) in app/ui code.
const FONT_FAMILY_ALLOW = [
  'src/ui/text.tsx', // Text/Heading — the typography components own font-family
  'src/ui/code-block.tsx', // monospace source block
  'src/ui/statusline-preview.tsx', // ANSI preview (monospace)
  'src/ui/textarea.tsx', // the monospace source-code input
  'src/ui/wordmark.tsx', // the statuslin.es wordmark (monospace)
  'src/ui/home-hero.tsx', // the home-page hero wordmark (bigger monospace + block cursor)
]
// Tailwind `font-<weight>` utilities — these are weights, not families, so they're fine.
const FONT_WEIGHTS = new Set([
  'thin',
  'extralight',
  'light',
  'normal',
  'medium',
  'semibold',
  'bold',
  'extrabold',
  'black',
])
// `font-<name>` where <name> isn't a weight is a font-family utility (font-mono, font-sans,
// or a typo like font-heading). Matches the class token; weights are filtered out below.
const FONT_CLASS = /\bfont-([a-z][a-z0-9]*)\b/g

/** Rule — font-family is centralized: a `font-<family>` class may appear only in the
 * typography file + the code/header allowlist. Elsewhere, text goes through Text/Heading,
 * so no component restates a font. Only runs on .tsx (CSS @theme legitimately names families). */
export function findRawFontFamily(path: string, content: string): string[] {
  if (!path.endsWith('.tsx') || FONT_FAMILY_ALLOW.includes(path) || path.startsWith(OG_DIR))
    return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const [cls, name] of content.matchAll(FONT_CLASS)) {
    if (!name || FONT_WEIGHTS.has(name) || seen.has(cls)) continue
    seen.add(cls)
    out.push(
      `${path}: '${cls}' sets a font family outside the typography components — render text through Text/Heading (font-family lives only in src/ui/text.tsx + the code/header allowlist)`,
    )
  }
  return out
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx|css|svg)$/.test(p) && !GENERATED.some((g) => p.endsWith(g))) acc.push(p)
  }
  return acc
}

// Run as a script (not under vitest): scan the tree and exit non-zero on any violation.
if (!process.env.VITEST) {
  const tokensCss = readFileSync(TOKENS_FILE, 'utf8')
  const tokenLiterals = tokenLiteralsOf(tokensCss)

  const all: string[] = []
  // Tokens-file integrity: define-once + theme-alias rules.
  all.push(...findDuplicateTokenLiterals(tokensCss))
  all.push(...findThemeAliasLiterals(tokensCss))

  // Design-system rules (inline style, raw color, dead palette, arbitrary value, file
  // size) police app code under src/ only — test fixtures legitimately carry runtime
  // ANSI color data (e.g. rgb(128,0,128)) that isn't design.
  const srcFiles = walk('src')
  for (const p of srcFiles) {
    const content = readFileSync(p, 'utf8')
    all.push(...findViolations(p, content))
    // Rule 2: no className= outside src/ui (src only — tests don't have ui components).
    all.push(...findClassNameOutsideUi(p, content))
    // Font-family is centralized: only the typography file + allowlist may set one.
    all.push(...findRawFontFamily(p, content))
  }

  // Token-echo runs over src/ AND test/: no literal anywhere may restate a token value.
  // Rule 3: UNSAFE_className must be preceded by // REASON: — runs src + test so test
  // fixtures using Box are also enforced.
  const testFiles = walk('test')
  const echoFiles = [...srcFiles, ...testFiles]
  for (const p of echoFiles) {
    const content = readFileSync(p, 'utf8')
    all.push(...findTokenEchoes(tokenLiterals, p, content))
    all.push(...findUnsafeClassNameWithoutReason(p, content))
  }

  if (all.length) {
    console.error(`Front-end gate failed:\n${all.map((m) => `  - ${m}`).join('\n')}`)
    process.exit(1)
  }
  console.log('Front-end gate passed.')
}
