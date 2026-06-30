// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocalTime } from '@/ui/local-time'

// 01:06 UTC. In US zones this is the previous calendar day — the exact gap that made the admin
// card's `toLocaleString()` produce different text on the server (UTC) than in the browser (local),
// throwing React #418 on every card. The server render must NOT depend on the host timezone.
const ISO = '2026-06-30T01:06:30.934Z'

describe('LocalTime', () => {
  it('server-renders a fixed UTC string so SSR and client hydration agree', () => {
    const html = renderToString(<LocalTime value={ISO} />)
    expect(html).toContain('Jun 30, 2026')
    expect(html).toContain('1:06')
    expect(html).toContain('UTC')
  })

  it('shows the same fixed UTC string for a Date and its ISO string (no ambient-clock input)', () => {
    const fromString = renderToString(<LocalTime value={ISO} />)
    const fromDate = renderToString(<LocalTime value={new Date(ISO)} />)
    expect(fromString).toBe(fromDate)
  })

  it('switches to the viewer local time after mount', async () => {
    render(<LocalTime value={ISO} />)
    const local = new Date(ISO).toLocaleString()
    await waitFor(() => expect(screen.getByText(local)).toBeTruthy())
  })
})
