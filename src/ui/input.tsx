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
        'border-input bg-field file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-8 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
      )}
      {...props}
    />
  )
}

export { Input }
