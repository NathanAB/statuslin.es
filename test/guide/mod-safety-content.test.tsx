// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { MOD_TILE_LABEL, THROUGH_PROGRAMS } from '@/mods/mod-fact-tiles'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const { ModSafetyContent } = await import('@/guide/mod-safety-content')

describe('ModSafetyContent', () => {
  it('renders the h1 and a section for each part of the answer', () => {
    render(<ModSafetyContent />)
    expect(
      screen.getByRole('heading', { level: 1, name: /are claude code mods safe\?/i }),
    ).toBeTruthy()
    for (const heading of [
      /what a mod can do once installed/i,
      /what claude plugin validate reports/i,
      /pinned to the commit a person reviewed/i,
      /read by a person before it's listed/i,
      /what's still on you/i,
      /check a mod yourself/i,
      /common questions/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
  })

  it('explains each footprint tile by the label the mod page shows', () => {
    render(<ModSafetyContent />)
    for (const label of [
      MOD_TILE_LABEL.usesYourPlan,
      MOD_TILE_LABEL.changesFiles,
      MOD_TILE_LABEL.network,
      MOD_TILE_LABEL.commands,
    ]) {
      expect(screen.getByRole('rowheader', { name: label })).toBeTruthy()
    }
    expect(screen.getByText(new RegExp(THROUGH_PROGRAMS))).toBeTruthy()
  })

  it('names the marketplace file and the validate command to run yourself', () => {
    const { container } = render(<ModSafetyContent />)
    expect(container.querySelector('a[href="/marketplace.json"]')).not.toBeNull()
    const steps = screen.getByRole('list')
    expect(steps.tagName).toBe('OL')
    expect(steps.textContent).toContain('claude plugin validate <path>')
  })

  it('links the mods', () => {
    const { container } = render(<ModSafetyContent />)
    expect(container.querySelector('a[href="/mods"]')).not.toBeNull()
  })

  it('answers its common questions', () => {
    render(<ModSafetyContent />)
    for (const entry of MOD_SAFETY_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })

  it('promises no safety and keeps the voice rules', () => {
    const { container } = render(<ModSafetyContent />)
    const page = container.textContent ?? ''
    expect(page).not.toMatch(/guaranteed safe|100% safe|completely safe/i)
    expect(page.replace(/\/statusline|statusLine/g, '')).not.toMatch(/statusline/i)
    expect(page).not.toContain('—')
  })
})
