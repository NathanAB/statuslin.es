import type * as React from 'react'

import { cn } from '@/lib/cn'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket DOM spread.
interface TextareaProps {
  id?: string
  value?: string
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
  rows?: number
  required?: boolean
  placeholder?: string
  maxLength?: number
  /** Monospace body, for source/code input. */
  mono?: boolean
  /** Start tall (e.g. the source-code field). field-sizing grows it further as you type;
   *  the `rows` attribute is ignored under field-sizing, so height comes from min-height. */
  tall?: boolean
}

function Textarea({ mono = false, tall = false, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content flex w-full rounded-lg border border-input bg-field px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm',
        tall ? 'min-h-80' : 'min-h-16',
        mono && 'font-mono',
      )}
      {...props}
    />
  )
}

export { Textarea }
