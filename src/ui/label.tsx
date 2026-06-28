import { Label as LabelPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/cn'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket spread.
// Radix wrapper — only the explicit props below pass through to LabelPrimitive.Root.
interface LabelProps {
  htmlFor?: string
  children?: React.ReactNode
}

function Label({ htmlFor, children }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      htmlFor={htmlFor}
      className={cn(
        'flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
      )}
    >
      {children}
    </LabelPrimitive.Root>
  )
}

export { Label }
