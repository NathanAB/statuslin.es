import { Checkbox as CheckboxPrimitive } from 'radix-ui'

import { cn } from '@/lib/cn'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket spread.
interface CheckboxProps {
  id?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function Checkbox({ id, checked, onCheckedChange }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      {...(checked !== undefined ? { checked } : {})}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-sm border border-input shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      )}
    >
      <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
        ✓
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
