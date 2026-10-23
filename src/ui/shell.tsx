import type * as React from 'react'
import { cn } from '@/lib/cn'
import { AppHeader, type AppHeaderUser } from '@/ui/app-header'
import { PAGE_COLUMN } from '@/ui/page-column'
import { SiteFooter } from '@/ui/site-footer'
import { TooltipProvider } from '@/ui/tooltip'

/**
 * The standard page frame: full-height background, shared header, the page's content and the
 * footer, all three on the one page column (`PAGE_COLUMN`), so every page lines up the same.
 *
 * `fullBleed` is the home page: main spans the window, since some of its sections are
 * full-width bands, and each section places itself on the column.
 */
export function PageShell({
  user,
  fullBleed = false,
  children,
}: {
  user: AppHeaderUser | null
  fullBleed?: boolean
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader user={user} />
        <main className={fullBleed ? 'w-full flex-1' : cn(PAGE_COLUMN, 'flex-1 py-8')}>
          {children}
        </main>
        <SiteFooter />
      </div>
    </TooltipProvider>
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
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader user={user} />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          {children}
        </main>
        <SiteFooter />
      </div>
    </TooltipProvider>
  )
}
