import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reads the :root palette in app.css, following var() references to their hex literal.
function paletteOf(css: string): (name: string) => string {
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
  const decls = new Map(
    [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  )
  const resolve = (name: string): string => {
    const value = decls.get(name)
    if (!value) throw new Error(`${name} is not defined in :root`)
    const ref = value.match(/^var\((--[\w-]+)\)$/)?.[1]
    return ref ? resolve(ref) : value
  }
  return resolve
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const linear = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5)
}
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const color = paletteOf(readFileSync('src/styles/app.css', 'utf8'))

describe('coral', () => {
  it('as a solid fill keeps light text on it at WCAG AA (4.5:1)', () => {
    expect(contrast(color('--primary-foreground'), color('--primary-fill'))).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('as text on the page stays at WCAG AA', () => {
    expect(contrast(color('--primary'), color('--background'))).toBeGreaterThanOrEqual(4.5)
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('solid coral fills', () => {
  it('use bg-primary-fill, whose shade light text passes AA on', () => {
    // bg-primary, or bg-primary/50 and above, is solid enough to put text on. Lighter tints
    // (bg-primary/25 behind a diff line) stay on the page's dark and are fine. bg-ring is the
    // same coral (--ring is var(--primary)).
    const solidCoral = /\bbg-(?:primary|ring)(?:\/(?:[5-9]\d|100))?(?![\w/-])/
    const offenders = sourceFiles('src').flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (solidCoral.test(line) ? [`${path}:${i + 1}`] : [])),
    )
    expect(offenders, 'replace bg-primary with bg-primary-fill on these lines').toEqual([])
  })
})

// WCAG 1.4.11: a focus ring needs 3:1 against what it sits on. The coral ring passes at full
// strength; at half strength (ring-ring/50) it drops to about 2:1.
describe('focus rings', () => {
  it('are coral at full strength, which shows on the page and on cards', () => {
    expect(contrast(color('--ring'), color('--background'))).toBeGreaterThanOrEqual(3)
    expect(contrast(color('--ring'), color('--card'))).toBeGreaterThanOrEqual(3)
  })

  it('never use a see-through ring', () => {
    const faintRing = /\b(?:ring|outline)-ring\/\d+/
    const offenders = [...sourceFiles('src'), 'src/styles/app.css'].flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (faintRing.test(line) ? [`${path}:${i + 1}`] : [])),
    )
    expect(offenders, 'use the full-strength ring on these lines').toEqual([])
  })
})
