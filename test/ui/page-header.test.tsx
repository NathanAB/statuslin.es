// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '@/ui/page-header'

// A redesigned page's opening: its title, then one sentence right under it.
describe('PageHeader', () => {
  it('sets the title as the h1 and the sentence right after it', () => {
    render(<PageHeader title="Claude Code tools" lead="Everything worth installing." />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Claude Code tools' })
    expect(h1.parentElement?.nextElementSibling?.textContent).toBe('Everything worth installing.')
  })

  // At the hero's display size a page title was too big: it's one step down the type scale.
  it("sets the title one size under the home hero's", () => {
    render(<PageHeader title="Claude Code tools" lead="Everything worth installing." />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.className.split(/\s+/)).toContain('text-heading')
    expect(h1.className.split(/\s+/)).not.toContain('text-display')
  })
})
