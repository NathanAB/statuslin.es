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
    expect(screen.getByText(/remove/i)).toBeTruthy()
  })
})
