import type * as React from 'react'

import { cn } from '@/lib/cn'
import { Heading, Text } from '@/ui/text'

// Closed props (docs/frontend-guidelines.md): no `className`. A titled panel with a coral
// left-accent + faint tint that pulls the eye — used where a section must not be skipped.
interface CalloutProps {
  title: string
  icon?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
}

export function Callout({ title, icon, description, children }: CalloutProps) {
  return (
    <div
      className={cn('rounded-lg border border-border border-l-4 border-l-primary bg-primary/5 p-4')}
    >
      <div className={cn('flex items-center gap-2')}>
        {icon ? <span className={cn('flex text-primary')}>{icon}</span> : null}
        <Heading level={3}>{title}</Heading>
      </div>
      {description ? (
        <div className={cn('mt-1')}>
          <Text muted size="sm">
            {description}
          </Text>
        </div>
      ) : null}
      {children ? <div className={cn('mt-3 border-border border-t pt-3')}>{children}</div> : null}
    </div>
  )
}
