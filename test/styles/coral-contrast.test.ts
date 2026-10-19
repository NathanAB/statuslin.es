import { readFileSync } from 'node:fs'
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

describe('text on a coral fill', () => {
  it('meets WCAG AA (4.5:1) for normal-size text', () => {
    const color = paletteOf(readFileSync('src/styles/app.css', 'utf8'))

    expect(contrast(color('--primary-foreground'), color('--primary'))).toBeGreaterThanOrEqual(4.5)
  })
})
