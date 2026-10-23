// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { Globe } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to} {...props}>
      {children}
    </a>
  ),
}))

const { GalleryList, GalleryRow, RowFacts, RowNote } = await import('@/ui/gallery-row')

const DESCRIPTION =
  'A long description that the row clamps to two lines on screen, while every word of it stays in the page for search engines and screen readers alike.'

function renderRow(onOpen = vi.fn()) {
  return render(
    <GalleryList>
      <GalleryRow
        to="/c/$slug"
        params={{ slug: 'meter' }}
        onOpen={onOpen}
        title="Meter"
        byline={<a href="https://github.com/octocat">@octocat</a>}
        facts={
          <RowFacts>
            {[
              <RowNote key="net" icon={Globe}>
                Network Access
              </RowNote>,
              '3 installs',
            ]}
          </RowFacts>
        }
        description={DESCRIPTION}
      >
        <code>ctx 42%</code>
      </GalleryRow>
    </GalleryList>,
  )
}

describe('GalleryRow', () => {
  it('titles the row with a heading whose link opens it', () => {
    const onOpen = vi.fn()
    renderRow(onOpen)

    const link = screen.getByRole('link', { name: 'Meter' })
    expect(link.getAttribute('href')).toBe('/c/meter')
    expect(link.closest('h3')).toBeTruthy()
    fireEvent.click(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('keeps the byline and the facts above the link that covers the row', () => {
    renderRow()

    expect(screen.getByRole('link', { name: '@octocat' }).closest('.z-10')).toBeTruthy()
    expect(screen.getByRole('list').closest('.z-10')).toBeTruthy()
  })

  it('lists the facts as separate items, a dot between them that is not read out', () => {
    renderRow()

    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Network Access', '·3 installs'])
    expect(items[1]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('·')
  })

  it('keeps the whole description in the page', () => {
    renderRow()

    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
  })

  // Only the home gallery's list animates its changes; facet pages and related lists stay still.
  it('keeps the rows of a plain list out of view transitions', () => {
    const { container } = renderRow()

    const row = container.querySelector('[data-slot=gallery-row]') as HTMLElement
    expect(row.closest('[class*="view-transition"]')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderRow()
    expect(await axe(container)).toHaveNoViolations()
  })
})
