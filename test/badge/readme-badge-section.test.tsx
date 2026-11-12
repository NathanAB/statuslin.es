// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReadmeBadgeSection } from '@/badge/readme-badge-section'

vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }))

// A different site name proves the alt text reads it from the one place it is set.
vi.mock('@/lib/site', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/site')>()),
  SITE_NAME: 'example.test',
}))

function renderSection() {
  render(<ReadmeBadgeSection kind="mod" slug="radar" origin="https://example.test" />)
}

describe('ReadmeBadgeSection', () => {
  it('speaks to whoever owns the listing, since every visitor sees it', () => {
    renderSection()

    expect(
      screen.getByText(
        'Own this listing? Add it to your README. The badge shows the install count as it grows.',
      ),
    ).toBeTruthy()
  })

  it('shows the live badge at its 20px height through the badge image', () => {
    renderSection()

    const image = screen.getByRole('img', { name: 'Reviewed on example.test' })
    expect(image.getAttribute('src')).toBe('https://example.test/badge/mods/radar.svg')
    expect(image.getAttribute('height')).toBe('20')
    expect(image.className).toContain('self-start')
  })

  it('names the site in both snippets alt text', () => {
    renderSection()

    expect(screen.getByText(/\[!\[Reviewed on example\.test\]/)).toBeTruthy()
    expect(screen.getByText(/\[!\[Preview on example\.test\]/)).toBeTruthy()
  })
})
