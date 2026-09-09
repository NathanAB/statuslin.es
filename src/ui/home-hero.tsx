import type { ReactNode } from 'react'
import { Wordmark } from '@/ui/wordmark'

export function HomeHero({ page = 1 }: { page?: number }) {
  return (
    <h1 className="text-foreground">
      <Wordmark size="hero" />
      {page > 1 ? (
        <>
          {' '}
          <span className="mt-3 block font-medium text-sm">Page {page}</span>
        </>
      ) : null}
    </h1>
  )
}

export function HomeMasthead({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-x-9 gap-y-4 sm:grid-cols-2">{children}</div>
}
