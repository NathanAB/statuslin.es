import type * as React from 'react'

import { cn } from '@/lib/cn'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket DOM spread.
interface InputProps {
  id?: string
  type?: React.HTMLInputTypeAttribute
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  required?: boolean
  maxLength?: number
  placeholder?: string
}

function Input({ type, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-field px-2.5 py-1 text-base outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm',
      )}
      {...props}
    />
  )
}

export { Input }
