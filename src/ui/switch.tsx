import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/cn'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket spread.
interface SwitchProps {
  id?: string
  checked?: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
  'aria-label'?: string
}

function Switch({ id, checked, disabled, onCheckedChange, ...aria }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      {...(checked !== undefined ? { checked } : {})}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-4xl border border-transparent shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
      )}
      {...aria}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 translate-x-0.5 rounded-4xl bg-foreground shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
