// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }))
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
  CenteredShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/submit/submit-form', () => ({ SubmitForm: () => null }))
vi.mock('@/mods/mod-submit-form', async () => {
  const actual =
    await vi.importActual<typeof import('@/mods/mod-submit-form')>('@/mods/mod-submit-form')
  return { ...actual, ModSubmitForm: () => null }
})

const { Route: SubmitRoute } = await import('@/routes/submit')

const USER = { id: 'ada', name: 'Ada' }

function renderSubmit(kind: 'status_line' | 'mod') {
  vi.spyOn(SubmitRoute, 'useLoaderData').mockReturnValue(
    (kind === 'mod'
      ? { kind, user: USER, draft: null }
      : { kind, user: USER, initial: null }) as never,
  )
  const Page = SubmitRoute.options.component
  return render(Page ? <Page /> : null)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('/submit kind toggle analytics', () => {
  it('captures switching from a status line to a mod', () => {
    renderSubmit('status_line')

    fireEvent.click(screen.getByRole('radio', { name: 'Mod' }))

    expect(capture).toHaveBeenCalledWith('submit_kind_changed', {
      kind: 'mod',
      previousKind: 'status_line',
    })
    expect(navigate).toHaveBeenCalledWith({ search: { kind: 'mod' } })
  })

  it('captures nothing when the current kind is clicked again', () => {
    renderSubmit('mod')

    fireEvent.click(screen.getByRole('radio', { name: 'Mod' }))

    expect(capture).not.toHaveBeenCalled()
  })
})

// The form keeps a form's width; beside it, what happens to a submission, so the column isn't
// half empty and a first-time submitter knows what they're agreeing to.
describe('/submit layout', () => {
  const next = () =>
    within(screen.getByRole('complementary', { name: 'What happens next' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent)

  it('says what happens to a status line after it is submitted', () => {
    renderSubmit('status_line')
    const steps = next()
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatch(/sandbox/)
    expect(steps[1]).toMatch(/person/)
    expect(steps[2]).toMatch(/email/)
  })

  it('says what happens to a mod after it is submitted', () => {
    renderSubmit('mod')
    const steps = next()
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatch(/commit/)
    expect(steps[2]).toMatch(/email/)
  })
})

describe('/submit signed out', () => {
  function renderSignedOut(kind: 'status_line' | 'mod') {
    vi.spyOn(SubmitRoute, 'useLoaderData').mockReturnValue({ kind, user: null } as never)
    const Page = SubmitRoute.options.component
    return render(Page ? <Page /> : null)
  }

  it('asks a visitor to sign in to submit either kind', () => {
    renderSignedOut('status_line')
    expect(
      screen.getByRole('heading', { name: 'Sign in to submit a status line or mod' }),
    ).toBeTruthy()
  })

  it('names the mod when the link picked one', () => {
    renderSignedOut('mod')
    expect(screen.getByRole('heading', { name: 'Sign in to submit a mod' })).toBeTruthy()
  })
})
