import { describe, expect, it } from 'vitest'
import { findTextWidthCaps } from '../../scripts/text-width-caps'

// The owner has asked more than once: text runs the full width of its column, never wrapped
// early by a cap. PageHeader's lead slipped through as a grid span, so spans count too.
describe('findTextWidthCaps', () => {
  it('flags a lead held to eight of twelve columns', () => {
    const tsx = `<p className="col-span-12 text-pretty text-foreground text-lead min-[56.25rem]:col-span-8">`
    expect(findTextWidthCaps('src/ui/page-header.tsx', tsx)).toHaveLength(1)
  })

  it('flags a max width on text', () => {
    expect(
      findTextWidthCaps('src/ui/x.tsx', `<div className="flex max-w-lg flex-col text-center">`),
    ).toHaveLength(1)
  })

  it('flags a measure in ch, em or max-w-prose wherever it is', () => {
    expect(findTextWidthCaps('src/ui/x.tsx', `const A = 'max-w-[65ch]'`)).toHaveLength(1)
    expect(findTextWidthCaps('src/ui/x.tsx', `const B = 'max-w-prose'`)).toHaveLength(1)
    expect(findTextWidthCaps('src/ui/x.tsx', `const C = 'w-[40ch] block'`)).toHaveLength(1)
    expect(findTextWidthCaps('src/ui/x.tsx', `const D = 'max-w-[22em]'`)).toHaveLength(1)
  })

  it('leaves layout spans, glyph-sized boxes and full-width text alone', () => {
    expect(findTextWidthCaps('src/ui/x.tsx', `'inline-block h-[1.1em] w-[0.6em]'`)).toEqual([])
    expect(
      findTextWidthCaps('src/ui/x.tsx', `<div className="min-w-0 lg:col-span-8">{children}</div>`),
    ).toEqual([])
    expect(
      findTextWidthCaps('src/ui/x.tsx', `<p className="col-span-12 text-lead text-foreground">`),
    ).toEqual([])
    expect(findTextWidthCaps('src/ui/x.tsx', `'max-w-full text-sm'`)).toEqual([])
  })

  it('lets a tooltip bubble keep its width, since it floats over the page', () => {
    const tsx = `'z-50 max-w-xs rounded-lg px-3 py-2 text-xs'`
    expect(findTextWidthCaps('src/ui/tooltip.tsx', tsx)).toEqual([])
  })
})
