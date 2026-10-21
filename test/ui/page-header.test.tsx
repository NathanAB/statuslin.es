// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '@/ui/page-header'

// A redesigned page's opening: its title, then one sentence right under it.
describe('PageHeader', () => {
  it('sets the title as the h1 and the sentence right after it', () => {
    render(<PageHeader title="Claude Code tools" lead="Everything worth installing." />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Claude Code tools' })
    expect(h1.nextElementSibling?.textContent).toBe('Everything worth installing.')
  })
})
