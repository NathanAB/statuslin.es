import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/cn'

// cn() resolves conflicting Tailwind classes, so it has to know which class names app.css adds.
// It treats an unknown `text-<name>` as a colour, and would delete a real colour next to it.
const css = readFileSync('src/styles/app.css', 'utf8')
const namesOf = (prefix: string) =>
  [...css.matchAll(new RegExp(`^\\s*--${prefix}-([a-z]+):`, 'gm'))].map(([, name]) => name)

describe('cn with the tokens app.css adds', () => {
  it.each(namesOf('text'))(
    'keeps the colour next to text-%s, and replaces a default size',
    (size) => {
      expect(cn('text-foreground', `text-${size}`)).toBe(`text-foreground text-${size}`)
      expect(cn('text-sm', `text-${size}`)).toBe(`text-${size}`)
    },
  )

  it.each(namesOf('radius'))('lets rounded-%s replace an earlier radius', (radius) => {
    expect(cn('rounded-full', `rounded-${radius}`)).toBe(`rounded-${radius}`)
  })

  it.each(namesOf('ease'))('lets ease-%s replace an earlier easing', (ease) => {
    expect(cn('ease-in', `ease-${ease}`)).toBe(`ease-${ease}`)
  })
})
