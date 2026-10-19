import type * as React from 'react'

import { cn } from '@/lib/cn'
import { Heading, Text } from '@/ui/text'

// Closed props (docs/frontend-guidelines.md): no `className`. A titled panel in a faint coral
// tint that pulls the eye, with no border: used where a section must not be skipped.
interface CalloutProps {
  title: string
  icon?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
}

export function Callout({ title, icon, description, children }: CalloutProps) {
  return (
    <div className={cn('rounded-panel bg-primary/8 px-5 py-4.5')}>
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
      {children ? <div className={cn('mt-4')}>{children}</div> : null}
    </div>
  )
}
