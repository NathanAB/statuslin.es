// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { identifyPostHogUser } from '@/lib/posthog-identity'
import { PENDING_AUTH_KEY } from '@/lib/sign-in'

const identify = vi.fn()
const capture = vi.fn()
const posthog = { identify, capture }

beforeEach(() => {
  window.sessionStorage.clear()
  identify.mockClear()
  capture.mockClear()
})

describe('identifyPostHogUser', () => {
  it('identifies the user and captures the completed OAuth intent', () => {
    window.sessionStorage.setItem(
      PENDING_AUTH_KEY,
      JSON.stringify({ entryPoint: 'submit', returnPath: '/submit' }),
    )

    identifyPostHogUser(posthog, { id: 'user-1', name: 'Nate', username: 'nate' })

    expect(identify).toHaveBeenCalledWith('user-1', { name: 'nate', username: 'nate' })
    expect(capture).toHaveBeenCalledWith('auth_completed', {
      provider: 'github',
      entryPoint: 'submit',
      returnPath: '/submit',
      $current_url: '/submit',
    })
  })

  it('does not emit completion without a pending OAuth intent', () => {
    identifyPostHogUser(posthog, { id: 'user-1', name: 'Nate', username: null })

    expect(identify).toHaveBeenCalledWith('user-1', { name: 'Nate', username: null })
    expect(capture).not.toHaveBeenCalled()
  })
})
