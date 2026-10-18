// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NOT_SHOWING_FAQ } from '@/guide/status-line-not-showing-faq'

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

const { StatusLineNotShowingContent } = await import('@/guide/status-line-not-showing-content')

const DOCS = 'https://code.claude.com/docs/en/statusline#troubleshooting'

function section(heading: RegExp): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: heading }).parentElement as HTMLElement
}

describe('StatusLineNotShowingContent', () => {
  it('renders the h1 and a section per symptom', () => {
    render(<StatusLineNotShowingContent />)
    expect(
      screen.getByRole('heading', { level: 1, name: /claude code status line not showing/i }),
    ).toBeTruthy()
    for (const heading of [
      /blank/i,
      /trust/i,
      /errors or hangs/i,
      /empty values/i,
      /context percentage/i,
      /garbled/i,
      /cut off/i,
      /turn .*off/i,
      /common questions/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
  })

  it('lists the blank status line checks in the order the docs give them', () => {
    render(<StatusLineNotShowingContent />)
    const steps = [...section(/blank/i).querySelectorAll('ol > li')].map((li) => li.textContent)
    const order = [
      'chmod +x ~/.claude/statusline.sh',
      'stdout',
      'by hand',
      'Git Bash',
      'disableAllHooks',
      'allowManagedHooksOnly',
      'claude --debug',
      'Ask Claude',
    ]
    expect(steps).toHaveLength(order.length)
    order.forEach((phrase, i) => {
      expect(steps[i], phrase).toContain(phrase)
    })
  })

  it('names the debug line a folder without workspace trust logs', () => {
    render(<StatusLineNotShowingContent />)
    expect(section(/trust/i).textContent).toContain(
      'Status line command skipped: workspace trust not accepted',
    )
  })

  it('gives the jq fallback for fields that are null at first', () => {
    render(<StatusLineNotShowingContent />)
    expect(section(/empty values/i).textContent).toContain('// 0')
  })

  it('points to used_percentage when the number differs from /context', () => {
    render(<StatusLineNotShowingContent />)
    expect(section(/context percentage/i).textContent).toContain('used_percentage')
  })

  it('names both ways to turn the status line off', () => {
    render(<StatusLineNotShowingContent />)
    const off = section(/turn .*off/i).textContent
    expect(off).toContain('/statusline delete')
    expect(off).toContain('statusLine')
  })

  it('sends Claude Desktop readers to the Desktop guide without repeating its fix', () => {
    const { container } = render(<StatusLineNotShowingContent />)
    expect(container.querySelector('a[href="/guide/claude-desktop"]')).not.toBeNull()
    expect(container.textContent).not.toMatch(/statusline-anywhere/i)
  })

  it('cites the docs and links the setup guide for the JSON shape', () => {
    const { container } = render(<StatusLineNotShowingContent />)
    expect(container.querySelector(`a[href="${DOCS}"]`)).not.toBeNull()
    expect(section(/errors or hangs/i).querySelector('a[href="/guide"]')).not.toBeNull()
  })

  it('ends with gallery facet pages and the setup guide', () => {
    const { container } = render(<StatusLineNotShowingContent />)
    for (const facet of ['minimal', 'token-usage', 'bash']) {
      expect(container.querySelector(`a[href="/status-lines/${facet}"]`), facet).not.toBeNull()
    }
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links.at(-1)).toBe('/guide')
  })

  it('answers its common questions', () => {
    render(<StatusLineNotShowingContent />)
    for (const entry of NOT_SHOWING_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })

  it('writes "status line" as two words and uses no em dashes', () => {
    const { container } = render(<StatusLineNotShowingContent />)
    const prose = (container.textContent ?? '').replace(
      /statusLine|\/statusline|statusline\.sh/g,
      '',
    )
    expect(prose).not.toMatch(/statusline/i)
    expect(prose).not.toContain('—')
    for (const entry of NOT_SHOWING_FAQ) {
      expect(entry.question + entry.answer).not.toContain('—')
    }
  })
})
