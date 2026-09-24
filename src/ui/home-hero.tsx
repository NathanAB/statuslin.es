import type { ReactNode } from 'react'
import { Wordmark } from '@/ui/wordmark'

export function HomeHero() {
  return (
    <div className="text-foreground">
      <Wordmark size="hero" />
    </div>
  )
}

export function HomeMasthead({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-x-9 gap-y-4 sm:grid-cols-2">{children}</div>
}
