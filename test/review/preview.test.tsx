import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AnsiSegment } from '@/render/types'
import { StatuslinePreview } from '@/ui/statusline-preview'

const seg = (text: string, fg: string | null = null): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

describe('StatuslinePreview', () => {
  it('escapes segment text (no HTML injection)', () => {
    const html = renderToStaticMarkup(
      <StatuslinePreview segments={[seg('<script>alert(1)</script>')]} />,
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert(1)')
  })
  it('renders each segment with its color', () => {
    const html = renderToStaticMarkup(
      <StatuslinePreview segments={[seg('Opus', 'rgb(128,0,128)')]} />,
    )
    expect(html).toContain('Opus')
    expect(html).toContain('rgb(128,0,128)')
  })
})
