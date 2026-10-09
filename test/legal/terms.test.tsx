// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TermsContent } from '@/legal/terms'
import { CONTACT_EMAIL, CONTENT_LICENSE } from '@/lib/site'

describe('TermsContent', () => {
  it('states submitted configs are released under the content license', () => {
    const { container } = render(<TermsContent />)
    const license = container.querySelector(`a[href="${CONTENT_LICENSE.url}"]`)
    expect(license).not.toBeNull()
    expect(screen.getByText(/public domain/i)).toBeTruthy()
  })

  it('gives a takedown / report contact', () => {
    const { container } = render(<TermsContent />)
    const contact = container.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)
    expect(contact).not.toBeNull()
  })

  it('states the maintainer can remove a config', () => {
    render(<TermsContent />)
    expect(screen.getByText(/remove any config/i)).toBeTruthy()
  })

  it('notes seeded configs keep their original license instead of CC0', () => {
    render(<TermsContent />)
    expect(screen.getByText(/original license/i)).toBeTruthy()
  })

  it('states listed mods keep their own license or have none', () => {
    render(<TermsContent />)
    const license = screen.getByText(/each mod keeps its own license, or has none/i)
    expect(license.textContent).toMatch(
      new RegExp(`${CONTENT_LICENSE.shortLabel} release above does not cover mods`),
    )
  })

  it("states mods are listed on their authors' behalf", () => {
    render(<TermsContent />)
    expect(screen.getByText(/listed on their authors' behalf/i)).toBeTruthy()
  })

  it('says how to have a mod removed on request', () => {
    render(<TermsContent />)
    const removal = screen.getByText(/mod removed on request/i)
    expect(removal.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull()
  })

  it('states the maintainer can remove any listed mod and anyone can report one', () => {
    render(<TermsContent />)
    const takedown = screen.getByText(/remove any listed mod at any time/i)
    expect(takedown.textContent).toMatch(/anyone can report a mod/i)
    expect(takedown.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull()
  })
})
