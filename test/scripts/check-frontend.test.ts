import { describe, expect, it } from 'vitest'
import {
  findClassNameOutsideUi,
  findDuplicateTokenLiterals,
  findRawFontFamily,
  findThemeAliasLiterals,
  findTokenEchoes,
  findUnsafeClassNameWithoutReason,
  findViolations,
} from '../../scripts/check-frontend'

describe('findViolations', () => {
  it('flags an inline style in a non-exempt file', () => {
    const v = findViolations('src/routes/index.tsx', '<div style={{ color: "red" }} />')
    expect(v.some((m) => m.includes('inline style'))).toBe(true)
  })
  it('allows inline style only in the preview component', () => {
    const v = findViolations('src/ui/statusline-preview.tsx', '<span style={{ color: s.fg }} />')
    expect(v).toHaveLength(0)
  })
  it('flags a raw hex color', () => {
    const v = findViolations('src/ui/button.tsx', 'const c = "#ff0000"')
    expect(v.some((m) => m.includes('raw color'))).toBe(true)
  })
  it('does not flag hex in the token file', () => {
    const v = findViolations('src/styles/app.css', '--neutral: #123456;')
    expect(v).toHaveLength(0)
  })
  it('flags an arbitrary Tailwind value in app code', () => {
    const v = findViolations('src/routes/index.tsx', '<div className="w-[437px]" />')
    expect(v.some((m) => m.includes('arbitrary'))).toBe(true)
  })
  it('allows arbitrary values in vendored src/ui primitives', () => {
    const v = findViolations(
      'src/ui/button.tsx',
      '<button className="bg-[color-mix(in_oklch,a,b)]" />',
    )
    expect(v).toHaveLength(0)
  })
  it('flags an arbitrary grid-cols value in app code', () => {
    const v = findViolations(
      'src/routes/index.tsx',
      '<div className="grid-cols-[repeat(3,200px)]" />',
    )
    expect(v.some((m) => m.includes('arbitrary'))).toBe(true)
  })
  it('does not flag arbitrary variant syntax (data-/aria-/&_svg)', () => {
    const v = findViolations(
      'src/routes/index.tsx',
      '<div className="data-[state=open]:bg-muted aria-[busy=true]:opacity-50 [&_svg]:size-4" />',
    )
    expect(v).toHaveLength(0)
  })
  it('passes clean token-based markup', () => {
    const v = findViolations('src/routes/index.tsx', '<div className="bg-card p-4 rounded-lg" />')
    expect(v).toHaveLength(0)
  })

  // Rule: route modules ship to the client — a server-only import crashes hydration.
  it('flags a @tanstack/react-start/server import in a route file', () => {
    const v = findViolations(
      'src/routes/admin/index.tsx',
      "import { setResponseStatus } from '@tanstack/react-start/server'",
    )
    expect(v.some((m) => m.includes('server-only'))).toBe(true)
  })
  it('allows the same server-only import in a feature module (server fn handler)', () => {
    const v = findViolations(
      'src/review/queue.ts',
      "import { getRequestHeaders } from '@tanstack/react-start/server'",
    )
    expect(v).toHaveLength(0)
  })

  // Rule 3 — style-prop regex catches the formatter's wrapped form.
  it('flags a wrapped style={ prop in a non-allowlisted file', () => {
    const v = findViolations(
      'src/routes/index.tsx',
      '<div\n  style={\n    { color: "red" }\n  }\n/>',
    )
    expect(v.some((m) => m.includes('inline style'))).toBe(true)
  })
  it('allows the wrapped style={ bridge in src/ui/sonner.tsx', () => {
    const v = findViolations(
      'src/ui/sonner.tsx',
      '<Sonner\n  style={\n    { "--normal-bg": "var(--popover)" }\n  }\n/>',
    )
    expect(v.some((m) => m.includes('inline style'))).toBe(false)
  })

  // Rule 4 — walk widened to .ts; raw-color regex requires a literal digit after rgb(/hsl(.
  it('flags a raw hex in a .ts file', () => {
    const v = findViolations('src/lib/theme.ts', 'const c = "#abc123"')
    expect(v.some((m) => m.includes('raw color'))).toBe(true)
  })
  it('allows interpolated rgb() with no literal digit (ansi runtime data)', () => {
    // The ${c.fg} here is literal fixture text mirroring src/render/ansi.ts, not a real placeholder.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional fixture string
    const v = findViolations('src/render/ansi.ts', 'fg: c.fg ? `rgb(${c.fg})` : null')
    expect(v.some((m) => m.includes('raw color'))).toBe(false)
  })

  // Rule 5 — dead Tailwind default-palette classes render nothing post-wipe.
  it('flags a dead default-palette class in tsx', () => {
    const v = findViolations('src/routes/index.tsx', '<div className="bg-red-500" />')
    expect(v.some((m) => m.includes('default-palette'))).toBe(true)
  })
  it('does not flag our token utilities', () => {
    const v = findViolations(
      'src/routes/index.tsx',
      '<div className="bg-primary text-muted-foreground border-border" />',
    )
    expect(v.some((m) => m.includes('default-palette'))).toBe(false)
  })
})

// Rule — font family is centralized: only the typography file + a tiny code/header
// allowlist may set a font-family class. Everything else renders text through Text/Heading.
describe('findRawFontFamily', () => {
  it('flags font-mono in a non-allowlisted ui component', () => {
    const v = findRawFontFamily('src/ui/meta-list.tsx', '<dd className="font-mono">{x}</dd>')
    expect(v.some((m) => m.includes('font family'))).toBe(true)
  })
  it('flags the font-heading typo (undefined family) anywhere outside the allowlist', () => {
    const v = findRawFontFamily('src/ui/card.tsx', '<div className="font-heading text-base" />')
    expect(v.some((m) => m.includes("'font-heading'"))).toBe(true)
  })
  it('allows font-mono in the typography file itself', () => {
    const v = findRawFontFamily('src/ui/text.tsx', "const c = mono && 'font-mono'")
    expect(v).toHaveLength(0)
  })
  it('allows font-mono in an allowlisted code/preview component', () => {
    const v = findRawFontFamily('src/ui/code-block.tsx', '<pre className="font-mono p-4" />')
    expect(v).toHaveLength(0)
  })
  it('does not flag font-weight utilities (those are not a family)', () => {
    const v = findRawFontFamily(
      'src/ui/badge.tsx',
      '<span className="font-medium font-semibold font-bold" />',
    )
    expect(v).toHaveLength(0)
  })
  it('ignores non-tsx files', () => {
    const v = findRawFontFamily('src/styles/app.css', '@apply font-mono text-sm;')
    expect(v).toHaveLength(0)
  })
  it('fires on a route/feature file too, not just src/ui', () => {
    const v = findRawFontFamily('src/routes/index.tsx', '<p className="font-mono">x</p>')
    expect(v.some((m) => m.includes('font family'))).toBe(true)
  })
})

// Rule 1 — define-once: each color literal DEFINED at most once in the tokens file.
describe('findDuplicateTokenLiterals', () => {
  it('flags an exact duplicate literal across two declarations', () => {
    const css = ':root {\n  --a: #123456;\n  --b: #123456;\n}'
    const v = findDuplicateTokenLiterals(css)
    expect(v.some((m) => m.includes('define by reference instead: var(--a)'))).toBe(true)
  })
  it('flags a shorthand-vs-long-form duplicate (#abc === #aabbcc)', () => {
    const css = ':root {\n  --a: #aabbcc;\n  --b: #abc;\n}'
    const v = findDuplicateTokenLiterals(css)
    expect(v.some((m) => m.includes('define by reference instead: var(--a)'))).toBe(true)
  })
  it('ignores var() reference lines', () => {
    const css = ':root {\n  --a: #123456;\n  --b: var(--a);\n}'
    const v = findDuplicateTokenLiterals(css)
    expect(v).toHaveLength(0)
  })
  it('passes a clean tokens file (every literal once)', () => {
    const css = ':root {\n  --a: #123456;\n  --b: #654321;\n  --c: var(--a);\n}'
    const v = findDuplicateTokenLiterals(css)
    expect(v).toHaveLength(0)
  })
})

// Rule 2 — theme aliases must be `initial` or var(), never a literal.
describe('findThemeAliasLiterals', () => {
  it('flags a --color-* alias defined with a literal', () => {
    const css = '@theme inline {\n  --color-primary: #998877;\n}'
    const v = findThemeAliasLiterals(css)
    expect(v.length).toBeGreaterThan(0)
  })
  it('passes initial and var()-based aliases', () => {
    const css =
      '@theme {\n  --color-*: initial;\n}\n@theme inline {\n  --color-primary: var(--primary);\n}'
    const v = findThemeAliasLiterals(css)
    expect(v).toHaveLength(0)
  })
})

// Rule 2 (enforcement stack) — className is banned outside src/ui.
describe('findClassNameOutsideUi', () => {
  it('flags a route file that uses className=', () => {
    const v = findClassNameOutsideUi('src/routes/index.tsx', '<div className="flex gap-4" />')
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]).toContain('className is banned outside src/ui')
  })

  it('flags a feature file that uses className=', () => {
    const v = findClassNameOutsideUi(
      'src/features/gallery/card.tsx',
      '<Card className="hover:ring" />',
    )
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]).toContain('className is banned outside src/ui')
  })

  it('does not flag a src/ui file that uses className=', () => {
    const v = findClassNameOutsideUi(
      'src/ui/button.tsx',
      '<button className="bg-primary text-sm" />',
    )
    expect(v).toHaveLength(0)
  })

  it('does not flag UNSAFE_className= (that is rule 3, not rule 2)', () => {
    const v = findClassNameOutsideUi(
      'src/routes/index.tsx',
      '// REASON: layout gap not expressible via primitives\n<Box UNSAFE_className="gap-3" />',
    )
    expect(v).toHaveLength(0)
  })

  it('flags a file that has both plain className= and UNSAFE_className= (plain className still flagged)', () => {
    const v = findClassNameOutsideUi(
      'src/routes/index.tsx',
      '// REASON: needed\n<Box UNSAFE_className="gap-3" />\n<div className="mt-4" />',
    )
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]).toContain('className is banned outside src/ui')
  })
})

// Rule 3 (enforcement stack) — UNSAFE_className requires a // REASON: comment immediately above.
describe('findUnsafeClassNameWithoutReason', () => {
  it('passes when UNSAFE_className has a // REASON: comment on the immediately preceding line', () => {
    const content = '// REASON: gap not in scale\n<Box UNSAFE_className="gap-3" />'
    const v = findUnsafeClassNameWithoutReason('src/routes/index.tsx', content)
    expect(v).toHaveLength(0)
  })

  it('flags UNSAFE_className with no preceding comment at all', () => {
    const content = '<Box UNSAFE_className="gap-3" />'
    const v = findUnsafeClassNameWithoutReason('src/routes/index.tsx', content)
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]).toContain('UNSAFE_className requires a // REASON:')
  })

  it('flags UNSAFE_className when the REASON comment is two lines above (not immediately above)', () => {
    const content = '// REASON: gap not in scale\n\n<Box UNSAFE_className="gap-3" />'
    const v = findUnsafeClassNameWithoutReason('src/routes/index.tsx', content)
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]).toContain('UNSAFE_className requires a // REASON:')
  })

  it('flags UNSAFE_className when the preceding line is a different comment', () => {
    const content = '// unrelated comment\n<Box UNSAFE_className="gap-3" />'
    const v = findUnsafeClassNameWithoutReason('src/routes/index.tsx', content)
    expect(v.length).toBeGreaterThan(0)
  })

  it('passes with leading whitespace on the REASON comment line', () => {
    const content = '  // REASON: needed for vendor layout\n  <Box UNSAFE_className="p-0" />'
    const v = findUnsafeClassNameWithoutReason('src/routes/index.tsx', content)
    expect(v).toHaveLength(0)
  })
})

// Rule 6 — no src/ or test/ literal may echo a tokens-file value.
describe('findTokenEchoes', () => {
  const tokenLiterals = new Set(['#123456', '#654321'])
  it('flags a literal equal to a token value', () => {
    const v = findTokenEchoes(tokenLiterals, 'src/foo.tsx', 'const c = "#123456"')
    expect(v.some((m) => m.includes('duplicates a token value'))).toBe(true)
  })
  it('flags a token echo in test/ too', () => {
    const v = findTokenEchoes(tokenLiterals, 'test/foo.test.ts', 'const c = "#654321"')
    expect(v.some((m) => m.includes('duplicates a token value'))).toBe(true)
  })
  it('passes an arbitrary non-token color', () => {
    const v = findTokenEchoes(tokenLiterals, 'src/foo.tsx', 'const c = "#ff0000"')
    expect(v).toHaveLength(0)
  })
})
