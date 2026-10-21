// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Radix DropdownMenu opens on pointerdown (left button), not a plain click — open it
// the way the component listens, which is what a real pointer interaction dispatches.
function openMenu(trigger: Element) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

// Mock the auth client so Log out can be asserted without a real network call.
const signOut = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: () => signOut() },
}))

// TanStack Router's <Link> needs a router context; stub it to a plain anchor so the
// header renders in isolation (we only assert on text + the menu, not navigation).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

// Radix DropdownMenu probes pointer APIs jsdom doesn't implement. Stub them so the
// trigger opens on click under the test environment.
// jsdom's window.location.assign throws "Not implemented"; stub it so the post-sign-out
// redirect can be asserted.
const assign = vi.fn()

beforeAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: jsdom shim for unimplemented DOM APIs.
  const proto = window.HTMLElement.prototype as any
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
  // jsdom's location.assign is a non-configurable readonly stub that throws; replace the
  // whole location object with a spyable one so the post-sign-out redirect is observable.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  })
})

afterEach(() => {
  signOut.mockClear()
  assign.mockClear()
})

// Imported after the mocks above are registered.
const { AppHeader } = await import('@/ui/app-header')

describe('AppHeader', () => {
  it('shows the sign-in button and no user menu when signed out', () => {
    render(<AppHeader user={null} />)
    expect(screen.getByText(/sign in/i)).toBeTruthy()
    expect(screen.queryByText('@ada')).toBeNull()
    expect(screen.queryByText('Log out')).toBeNull()
  })

  it('links to the resources page when signed out', () => {
    const { container } = render(<AppHeader user={null} />)
    expect(container.querySelector('a[href="/resources"]')).not.toBeNull()
  })

  // The guide is for writing a status line; "Guide" alone read as how to install one. A Mods
  // link with no Status lines link beside it read as out of place, so the bar has neither: the home
  // page lists both, and the footer links Mods.
  it('leads with the guide, which says it is for writing a status line, and links no Mods page', () => {
    const { container } = render(<AppHeader user={null} />)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getAllByRole('link')[0]?.textContent).toBe('Write a status line')
    expect(screen.getByRole('link', { name: 'Write a status line' }).getAttribute('href')).toBe(
      '/guide',
    )
    expect(container.querySelector('a[href="/mods"]')).toBeNull()
  })

  // We want people to submit: Submit is the header's one filled button, beside sign-in, and stays
  // in the bar on phones, where the other links fold into the menu.
  it('shows Submit as a filled button between Star and sign-in, outside the folding links', () => {
    render(<AppHeader user={null} />)
    const submit = screen.getByRole('link', { name: 'Submit' })
    expect(submit.getAttribute('href')).toBe('/submit')
    expect(submit.getAttribute('data-variant')).toBe('default')
    expect(submit.closest('nav')).toBeNull()
    const star = screen.getByRole('link', { name: 'Star statuslin.es on GitHub' })
    const signIn = screen.getByRole('button', { name: 'Sign in with GitHub' })
    expect(star.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(submit.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the Star on GitHub link', () => {
    render(<AppHeader user={null} />)
    expect(screen.getByRole('link', { name: 'Star statuslin.es on GitHub' })).toBeTruthy()
  })

  it('shows the avatar image and @username for a signed-in user', () => {
    const { container } = render(
      <AppHeader
        user={{
          name: 'Ada Lovelace',
          username: 'ada',
          image: 'https://example.com/a.png',
          role: 'user',
        }}
      />,
    )
    expect(screen.getByText('@ada')).toBeTruthy()
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('https://example.com/a.png')
  })

  it('falls back to the display name when username is null', () => {
    render(<AppHeader user={{ name: 'Ada Lovelace', username: null, image: null, role: 'user' }} />)
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
  })

  // Phones hide the text label and show only the avatar, so the trigger names itself.
  it('names the user menu trigger @username for screen readers', () => {
    render(
      <AppHeader
        user={{
          name: 'Ada Lovelace',
          username: 'ada',
          image: 'https://example.com/a.png',
          role: 'user',
        }}
      />,
    )
    const trigger = screen.getByRole('button', { name: '@ada' })
    expect(trigger.getAttribute('aria-label')).toBe('@ada')
  })

  it('names the user menu trigger with the display name when username is null', () => {
    render(<AppHeader user={{ name: 'Ada Lovelace', username: null, image: null, role: 'user' }} />)
    const trigger = screen.getByRole('button', { name: 'Ada Lovelace' })
    expect(trigger.getAttribute('aria-label')).toBe('Ada Lovelace')
  })

  it('opens a Log out menu item on trigger click and calls signOut', async () => {
    render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'user' }} />,
    )

    // No Review for a non-admin.
    openMenu(screen.getByText('@ada'))
    const logout = await screen.findByText('Log out')
    expect(screen.queryByText('Review')).toBeNull()

    fireEvent.click(logout)
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    // Sign-out sends the user home with a full reload (loader data depends on the session).
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('reloads home when sign-out fetch fails without an unhandled rejection', async () => {
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)
    signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'user' }} />,
    )
    openMenu(screen.getByText('@ada'))
    fireEvent.click(await screen.findByText('Log out'))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
    await Promise.resolve()
    await Promise.resolve()
    process.off('unhandledRejection', onUnhandled)
    expect(onUnhandled).not.toHaveBeenCalled()
  })

  it('includes a Review menu item only for admins', async () => {
    render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'admin' }} />,
    )
    openMenu(screen.getByText('@ada'))
    expect(await screen.findByText('Review')).toBeTruthy()
    expect(screen.getByText('Log out')).toBeTruthy()
  })
})
