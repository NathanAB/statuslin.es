// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { STATUS_LINE_FIX_PROMPT } from '@/guide/fix-prompt'
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

const toast = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast }))

const { StatusLineNotShowingContent } = await import('@/guide/status-line-not-showing-content')

const DOCS = 'https://code.claude.com/docs/en/statusline#troubleshooting'

function section(heading: RegExp): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: heading }).parentElement as HTMLElement
}

describe('StatusLineNotShowingContent', () => {
  // Visitors are Claude Code users: the page's checks, as a prompt that runs them on their machine.
  // It's shown before they copy it, so they see what they're pasting.
  it('offers a prompt that has Claude Code find the problem, under the intro', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<StatusLineNotShowingContent />)

    const panel = screen.getByRole('region', { name: 'Let Claude Code find the problem' })
    const shown = [...panel.querySelectorAll('pre')].map((pre) => pre.textContent)
    expect(shown).toEqual([STATUS_LINE_FIX_PROMPT])
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Copy fix prompt' }))
    })
    expect(writeText).toHaveBeenCalledWith(STATUS_LINE_FIX_PROMPT)
    expect(toast).toHaveBeenCalledWith('Prompt copied', {
      description: 'Paste it into Claude Code.',
    })

    const h1 = screen.getByRole('heading', { level: 1 })
    const firstFix = screen.getAllByRole('heading', { level: 2 })[1]
    expect(h1.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      firstFix && panel.compareDocumentPosition(firstFix) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

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
