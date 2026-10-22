// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

const { MINIMAL_SCRIPT, MINIMAL_SCRIPT_OUTPUT, SAMPLE_STDIN_JSON, SETTINGS_SNIPPET } = await import(
  '@/guide/examples'
)
const { GuideContent } = await import('@/guide/guide-content')

const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const pre = (s: string) => `<pre class="shiki"><code>${esc(s)}</code></pre>`
const highlights = {
  payloadHtml: pre(SAMPLE_STDIN_JSON),
  scriptHtml: pre(MINIMAL_SCRIPT),
  settingsHtml: pre(SETTINGS_SNIPPET),
}

describe('GuideContent', () => {
  it('renders the h1 and all section headings', () => {
    render(<GuideContent highlights={highlights} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'How to set up a Claude Code status line',
      }),
    ).toBeTruthy()
    for (const heading of [
      /the fast paths/i,
      /wire up a script by hand/i,
      /common questions/i,
      /going further/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { name: /two pitfalls/i })).toBeNull()
    for (const heading of [
      /the json your script receives/i,
      /a minimal working script/i,
      /why isn.t the git branch in the json/i,
      /why is used_percentage null/i,
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: heading })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { level: 2, name: /the json/i })).toBeNull()
    expect(
      screen.queryByRole('heading', { name: /how does this site know what a script prints/i }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { name: /why is used_percentage null/i }).nextElementSibling
        ?.textContent,
    ).toMatch(/\/\/ 0/)
  })

  // "Guide" read as "how to install one"; it's for writing your own, and says where installing is.
  it('says up top that it is for writing your own, and sends installers to the gallery', () => {
    render(<GuideContent highlights={highlights} />)
    const lead = screen.getByText(/This guide is for writing your own from scratch/)
    expect(
      within(lead).getByRole('link', { name: 'install one from the gallery' }).getAttribute('href'),
    ).toBe('/')
  })

  it('shows when the guide was last updated', () => {
    render(<GuideContent highlights={highlights} />)
    expect(screen.getByText(/^Updated \d{4}-\d{2}-\d{2}$/)).toBeTruthy()
  })

  it('shows the example output once, in the step that tests the script, not in the intro', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    expect(page).not.toContain("That's the whole mechanism")
    expect(page).not.toContain('What the script on this page prints')
    const previews = [...container.querySelectorAll('code')].filter(
      (el) => el.textContent === MINIMAL_SCRIPT_OUTPUT && !el.closest('.shiki'),
    )
    expect(previews).toHaveLength(1)
    expect(previews[0]?.closest('#test-it')).not.toBeNull()
    expect(previews[0]?.closest('[data-ui]')?.previousElementSibling?.textContent).toMatch(
      /for that payload it prints/i,
    )
  })

  // Someone writing their own wants the steps first, each with its code under it, then the JSON.
  it('wires up a script in four numbered steps, then shows the JSON it receives', () => {
    render(<GuideContent highlights={highlights} />)
    const section = screen.getByRole('region', { name: 'Wire up a script by hand' })
    const steps = within(within(section).getByRole('list', { name: 'Steps' })).getAllByRole(
      'listitem',
    )
    expect(
      steps.map((step) => within(step).getByRole('heading', { level: 3 }).textContent),
    ).toEqual([
      'Save a minimal working script',
      'Make it runnable',
      'Point settings.json at it',
      'Test it',
    ])
    const [save, runnable, settings, test] = steps as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ]
    expect(within(save).getByRole('button', { name: 'Copy script' })).toBeTruthy()
    expect(
      within(runnable).getByText('chmod +x ~/.claude/statusline.sh').closest('pre'),
    ).toBeTruthy()
    expect(within(settings).getByRole('button', { name: 'Copy settings' })).toBeTruthy()
    expect(within(test).getByText('bash statusline.sh < sample.json').closest('pre')).toBeTruthy()

    const json = within(section).getByRole('heading', {
      level: 3,
      name: 'The JSON your script receives',
    })
    expect(test.compareDocumentPosition(json) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The script calls jq, which many machines don't have.
  it('says the script needs jq, and how to install it', () => {
    expect(MINIMAL_SCRIPT).toMatch(/\bjq -r\b/)
    render(<GuideContent highlights={highlights} />)
    const save = screen
      .getByRole('heading', { name: 'Save a minimal working script' })
      .closest('li')
    const note = save?.textContent ?? ''
    expect(note).toMatch(/needs jq/i)
    expect(note).toContain('brew install jq')
    expect(note).toContain('sudo apt install jq')
  })

  it('points the test step at the sample JSON below it', () => {
    render(<GuideContent highlights={highlights} />)
    const test = screen.getByRole('heading', { name: 'Test it' }).closest('li') as HTMLElement
    expect(within(test).getByRole('link', { name: 'the sample JSON' }).getAttribute('href')).toBe(
      '#the-json-your-script-receives',
    )
  })

  // Links like /guide#the-json-your-script-receives land on the section they name.
  it('gives every h2 and h3 section a stable id', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    for (const [id, heading] of [
      ['the-fast-paths', 'The fast paths'],
      ['run-statusline', 'Run /statusline'],
      ['copy-from-the-gallery', 'Copy from the gallery'],
      ['wire-up-a-script-by-hand', 'Wire up a script by hand'],
      ['save-a-minimal-working-script', 'Save a minimal working script'],
      ['make-it-runnable', 'Make it runnable'],
      ['point-settings-json-at-it', 'Point settings.json at it'],
      ['test-it', 'Test it'],
      ['the-json-your-script-receives', 'The JSON your script receives'],
      ['common-questions', 'Common questions'],
      ['going-further', 'Going further'],
    ] as const) {
      const target = container.querySelector(`[id="${id}"]`)
      expect(target, id).not.toBeNull()
      const named = target?.matches('h2, h3') ? target : target?.querySelector('h2, h3')
      expect(named?.textContent, id).toBe(heading)
    }
  })

  it('lists the sections in a contents list that links to each one', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'The fast paths',
      'Wire up a script by hand',
      'Save a minimal working script',
      'Make it runnable',
      'Point settings.json at it',
      'Test it',
      'The JSON your script receives',
      'Common questions',
      'Going further',
    ])
    for (const link of links) {
      const id = link.getAttribute('href')?.replace(/^#/, '') ?? ''
      expect(container.querySelector(`[id="${id}"]`), id).not.toBeNull()
    }
  })

  it('shows the real payload fields, the script, its output, and the settings snippet', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    for (const field of [
      '"context_window"',
      '"used_percentage"',
      '"total_cost_usd"',
      '"display_name"',
      '"rate_limits"',
      '"transcript_path"',
    ]) {
      expect(page).toContain(field)
    }
    expect(page).toContain('jq -r')
    expect(page).toContain(MINIMAL_SCRIPT_OUTPUT)
    expect(page).toContain('"statusLine"')
  })

  it('copies each code well from its overlay control', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    render(<GuideContent highlights={highlights} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy settings' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SETTINGS_SNIPPET))

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SAMPLE_STDIN_JSON))

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MINIMAL_SCRIPT))
  })

  // Nested boxes read as clutter: sections are headings on the page, the fast paths one panel each.
  it('puts no section in a card, and no box inside another', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    expect(container.querySelector('[data-slot="card"]')).toBeNull()
    expect(screen.getByRole('region', { name: 'Wire up a script by hand' })).toBeTruthy()
    for (const panel of container.querySelectorAll('[data-slot="panel"]')) {
      expect(panel.querySelector('[data-slot="panel"]')).toBeNull()
    }
  })

  it('keeps the gallery fast path a link inside a card, not a card that is a link', () => {
    render(<GuideContent highlights={highlights} />)
    const heading = screen.getByRole('heading', { name: /copy from the gallery/i })
    expect(heading.querySelector('a')).toBeNull()
    expect(screen.getByRole('link', { name: /browse claude code status lines/i })).toBeTruthy()
  })

  it('says which git facts the JSON has and which a script must get from git', () => {
    render(<GuideContent highlights={highlights} />)
    const answer = screen.getByRole('heading', { name: /why isn.t the git branch in the json/i })
      .nextElementSibling?.textContent
    expect(answer).toMatch(/workspace\.repo/)
    expect(answer).toMatch(/run `?git`?/)
  })

  it('says the status line runs as soon as the settings are saved', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    expect(page).not.toMatch(/on your next message/i)
    expect(page).toMatch(/as soon as you save/i)
  })

  it('links to the gallery, resources, submit, the other guides and the official docs', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    for (const href of [
      '/',
      '/resources',
      '/submit',
      '/guide/claude-desktop',
      '/guide/status-lines-vs-mods',
      '/guide/status-line-not-showing',
    ]) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(
      container.querySelector('a[href="https://code.claude.com/docs/en/statusline"]'),
    ).not.toBeNull()
  })

  it('links the payload fields to the facet pages that show them', () => {
    render(<GuideContent highlights={highlights} />)
    const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(hrefOf('token usage')).toBe('/status-lines/token-usage')
    expect(hrefOf('usage limits')).toBe('/status-lines/quota')
    expect(hrefOf('git status')).toBe('/status-lines/git')
  })
})
