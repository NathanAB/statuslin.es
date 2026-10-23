// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: () => signOut() },
}))

const startGitHubSignIn = vi.fn()
vi.mock('@/lib/sign-in', () => ({
  startGitHubSignIn: (...args: unknown[]) => startGitHubSignIn(...args),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const assign = vi.fn()

beforeAll(() => {
  // jsdom's location.assign throws; swap in a spy so the post-sign-out redirect is observable.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign, pathname: '/', search: '' },
  })
})

const realMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = realMatchMedia
  signOut.mockClear()
  startGitHubSignIn.mockClear()
  assign.mockClear()
})

const { AppHeader } = await import('@/ui/app-header')

// jsdom has no matchMedia. This one starts narrow (the phone layout) and can widen past md.
function fakeViewport() {
  const listeners = new Set<() => void>()
  const query = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia
  return {
    widen() {
      query.matches = true
      for (const listener of listeners) listener()
    },
  }
}

function openPhoneMenu() {
  const button = screen.getByRole('button', { name: 'Menu' })
  fireEvent.click(button)
  return { button, menu: screen.getByRole('dialog', { name: 'Menu' }) }
}

describe('the phone menu', () => {
  it('starts closed', () => {
    render(<AppHeader user={null} />)
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists every header link and sign-in for a signed-out visitor', () => {
    render(<AppHeader user={null} />)
    const { button, menu } = openPhoneMenu()

    expect(button.getAttribute('aria-expanded')).toBe('true')
    const links = within(menu)
    expect(links.queryByRole('link', { name: 'Mods' })).toBeNull()
    expect(links.queryByRole('link', { name: 'Write a status line' })).toBeNull()
    expect(links.getByRole('link', { name: 'Resources' }).getAttribute('href')).toBe('/resources')
    expect(links.getByRole('link', { name: 'Submit' }).getAttribute('href')).toBe('/submit')
    expect(links.getByRole('link', { name: 'GitHub' })).toBeTruthy()
    expect(links.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
  })

  it('starts GitHub sign-in from the header entry point', () => {
    render(<AppHeader user={null} />)
    const { menu } = openPhoneMenu()
    fireEvent.click(within(menu).getByRole('button', { name: 'Sign in with GitHub' }))
    expect(startGitHubSignIn).toHaveBeenCalledWith('/', 'header', expect.anything())
  })

  it('closes when a link is chosen', async () => {
    render(<AppHeader user={null} />)
    const { menu } = openPhoneMenu()
    fireEvent.click(within(menu).getByRole('link', { name: 'Resources' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on Escape and with its close button', async () => {
    render(<AppHeader user={null} />)
    fireEvent.keyDown(openPhoneMenu().menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const { menu } = openPhoneMenu()
    fireEvent.click(within(menu).getByRole('button', { name: 'Close menu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('stops the page behind it from scrolling while open', async () => {
    render(<AppHeader user={null} />)
    fireEvent.keyDown(openPhoneMenu().menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)

    openPhoneMenu()
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(true)
  })

  // The menu is hidden from md up, so left open it would leave the page inert behind nothing.
  it('closes when the window widens to the desktop layout', async () => {
    const viewport = fakeViewport()
    render(<AppHeader user={null} />)
    openPhoneMenu()
    act(() => viewport.widen())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('gives a signed-in admin their account links, and Sign out signs them out', async () => {
    render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'admin' }} />,
    )
    const menu = within(openPhoneMenu().menu)

    expect(menu.getByRole('link', { name: 'My submissions' }).getAttribute('href')).toBe('/me')
    expect(menu.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/admin/review')
    expect(menu.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull()

    fireEvent.click(menu.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('shows no Review link to a signed-in user who is not an admin', () => {
    render(
      <AppHeader user={{ name: 'Ada Lovelace', username: 'ada', image: null, role: 'user' }} />,
    )
    const menu = within(openPhoneMenu().menu)
    expect(menu.getByRole('link', { name: 'My submissions' })).toBeTruthy()
    expect(menu.queryByRole('link', { name: 'Review' })).toBeNull()
  })
})
