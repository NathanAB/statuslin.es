import type * as React from 'react'

import { AppHeader, type AppHeaderUser } from '@/ui/app-header'
import { SiteFooter } from '@/ui/site-footer'

/**
 * The standard page frame: full-height background, shared header, and a centered
 * max-width main column. Used by the gallery and detail pages.
 *
 * `narrow` switches the main column to max-w-lg — for top-aligned single-column
 * forms like the submit page that are NOT vertically centered (use CenteredShell for that).
 */
export function PageShell({
  user,
  narrow = false,
  children,
}: {
  user: AppHeaderUser | null
  narrow?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader user={user} />
      <main className={`mx-auto w-full flex-1 px-6 py-8 ${narrow ? 'max-w-lg' : 'max-w-5xl'}`}>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

/**
 * The signed-out / login frame: header on top, then a flex-1 column that centers
 * its children vertically and horizontally (login redirect, signed-out submit).
 */
export function CenteredShell({
  user,
  children,
}: {
  user: AppHeaderUser | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader user={user} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">{children}</main>
      <SiteFooter />
    </div>
  )
}
