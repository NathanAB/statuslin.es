// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('links to the resources page when signed in', () => {
    const { container } = render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'user' }} />,
    )
    expect(container.querySelector('a[href="/resources"]')).not.toBeNull()
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

  it('includes a Review menu item only for admins', async () => {
    render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'admin' }} />,
    )
    openMenu(screen.getByText('@ada'))
    expect(await screen.findByText('Review')).toBeTruthy()
    expect(screen.getByText('Log out')).toBeTruthy()
  })
})
