// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TermsContent } from '@/legal/terms'
import { CONTACT_EMAIL, CONTENT_LICENSE } from '@/lib/site'

describe('TermsContent', () => {
  it('states submitted status lines are released under the content license', () => {
    const { container } = render(<TermsContent />)
    const license = container.querySelector(`a[href="${CONTENT_LICENSE.url}"]`)
    expect(license).not.toBeNull()
    expect(screen.getByText(/public domain/i)).toBeTruthy()
  })

  it('calls the gallery one of mods, naming status lines once as one kind', () => {
    render(<TermsContent />)
    expect(
      screen.getByText(/community gallery of Claude Code mods, including status lines\./),
    ).toBeTruthy()
  })

  // Both kinds are rendered in a sandbox and reviewed; saying so of status lines alone read as if
  // mods were not.
  it('says both kinds are rendered in a sandbox and reviewed before they appear', () => {
    render(<TermsContent />)
    expect(
      screen.getByText(
        /Submitted status lines and mods are rendered in a sandbox and reviewed before they appear\./,
      ),
    ).toBeTruthy()
  })

  it('puts the risk of running a status line or mod on the visitor', () => {
    render(<TermsContent />)
    expect(screen.getByText(/copy or install at your own risk/i)).toBeTruthy()
  })

  it('notes seeded status lines keep their original license instead of CC0', () => {
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

  it('says anyone signed in can submit a mod, credited to its repository owner', () => {
    render(<TermsContent />)
    const listing = screen.getByText(/anyone signed in can submit a mod/i)
    expect(listing.textContent).toMatch(/each mod is credited to its repository's owner/i)
    expect(screen.queryByText(/on their authors' behalf/i)).toBeNull()
  })

  it('binds a mod submitter to a public repository, the right to share it and no malice', () => {
    render(<TermsContent />)
    const clause = screen.getByText(/by submitting a mod, you confirm/i)
    expect(clause.textContent).toMatch(
      /the repository is public, you have the right to share the mod, and it isn't malicious/i,
    )
  })

  it('says how to have a mod removed on request', () => {
    render(<TermsContent />)
    const removal = screen.getByText(/mod removed on request/i)
    expect(removal.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull()
  })

  it('states the maintainer can remove any status line or mod and anyone can report one', () => {
    render(<TermsContent />)
    const takedown = screen.getByText(
      /remove any status line or mod at any time and at their discretion/i,
    )
    expect(takedown.textContent).toMatch(/anyone can report one/i)
    expect(takedown.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull()
  })
})
