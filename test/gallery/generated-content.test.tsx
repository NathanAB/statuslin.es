// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { GeneratedContent } from '@/content/types'
import { GeneratedContentSections } from '@/gallery/generated-content'

const CONTENT: GeneratedContent = {
  whatItShows: ['Current git branch'],
  requirements: ['bash', 'jq on PATH'],
  behaviorNotes: ['Branch segment disappears outside a git repo'],
}

describe('GeneratedContentSections', () => {
  it('renders the three section titles and their items', () => {
    render(<GeneratedContentSections content={CONTENT} />)
    expect(screen.getByRole('heading', { level: 2, name: 'What it shows' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Behavior notes' })).toBeTruthy()
    expect(screen.getByText('jq on PATH')).toBeTruthy()
  })

  it('skips a section whose list is empty', () => {
    render(<GeneratedContentSections content={{ ...CONTENT, behaviorNotes: [] }} />)
    expect(screen.getByText('What it shows')).toBeTruthy()
    expect(screen.queryByText('Behavior notes')).toBeNull()
  })

  it('renders nothing when every section is empty', () => {
    const { container } = render(
      <GeneratedContentSections
        content={{ whatItShows: [], requirements: [], behaviorNotes: [] }}
      />,
    )
    expect(container.innerHTML).toBe('')
  })
})
