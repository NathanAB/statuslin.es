import { describe, expect, it } from 'vitest'
import { highlightSource, resolveSourceHtml, tryHighlightSource } from '@/lib/highlight'

describe('highlightSource', () => {
  it('wraps the source in a Shiki <pre>', async () => {
    const html = await highlightSource('echo hi', 'bash')
    expect(html).toContain('class="shiki')
    expect(html).toContain('<pre')
  })

  it('escapes HTML in the source so it cannot inject markup', async () => {
    const html = await highlightSource('echo "<script>alert(1)</script>"', 'bash')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('</script>')
    // The dangerous `<` is escaped to an entity (Shiki uses the hex form).
    expect(html).toContain('&#x3C;')
  })

  it('highlights each supported interpreter without throwing', async () => {
    await expect(highlightSource('print("hi")', 'python')).resolves.toContain('shiki')
    await expect(highlightSource('console.log(1)', 'node')).resolves.toContain('shiki')
  })

  it('skips Shiki for oversized source and returns escaped plain HTML (DoS guard)', async () => {
    // Shiki's bash grammar is ~quadratic on pathological input; a 100KB run blocks the event
    // loop for seconds. Above the cap we render escaped plain text instead — instant and safe.
    const big = `${'a'.repeat(25_000)}\n<script>alert(1)</script>`
    const html = await highlightSource(big, 'bash')
    expect(html).toContain('<pre class="shiki"><code>')
    expect(html).not.toContain('class="line"') // not Shiki's per-line token markup
    expect(html).not.toContain('<script>') // dangerous markup still escaped
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes an HTML breakout payload so it cannot inject markup (XSS boundary)', async () => {
    const html = await highlightSource(
      '</span></code></pre><script>alert(document.cookie)</script>',
      'bash',
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('</pre><script')
    expect(html).toContain('&#x3C;script') // Shiki escapes < to a hex entity
  })
})

describe('resolveSourceHtml', () => {
  it('returns the stored HTML as-is when present, skipping Shiki', async () => {
    // A sentinel that Shiki would never produce — proves the stored value is used verbatim.
    const html = await resolveSourceHtml('<pre>STORED</pre>', 'echo hi', 'bash')
    expect(html).toBe('<pre>STORED</pre>')
  })

  it('highlights live when the stored HTML is null', async () => {
    const html = await resolveSourceHtml(null, 'echo hi', 'bash')
    expect(html).toContain('class="shiki')
    expect(html).toContain('echo')
  })
})

describe('tryHighlightSource', () => {
  it('returns highlighted HTML for valid source', async () => {
    await expect(tryHighlightSource('echo hi', 'bash')).resolves.toContain('class="shiki')
  })
})
