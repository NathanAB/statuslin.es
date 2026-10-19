// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormLayout } from '@/ui/form-layout'

// The form keeps a form's width; the panel beside it fills the rest of the column.
describe('FormLayout', () => {
  it('puts the form first, then a side panel named by its heading', () => {
    render(
      <FormLayout asideTitle="What happens next" aside={<p>steps</p>}>
        <form aria-label="Submit" />
      </FormLayout>,
    )

    const form = screen.getByRole('form', { name: 'Submit' })
    const aside = screen.getByRole('complementary', { name: 'What happens next' })
    expect(within(aside).getByText('steps')).toBeTruthy()
    expect(form.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
