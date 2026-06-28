import { X } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Text } from '@/ui/text'

// Closed props (docs/frontend-guidelines.md): no `className`. A labeled pill with a remove
// control — used for declared network hosts.
interface RemovableChipProps {
  label: string
  onRemove: () => void
}

export function RemovableChip({ label, onRemove }: RemovableChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-4xl border border-border bg-muted py-1 pr-1.5 pl-3',
      )}
    >
      <Text inline mono size="sm">
        {label}
      </Text>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className={cn(
          'inline-flex size-5 cursor-pointer items-center justify-center rounded-4xl text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
        )}
      >
        <X className={cn('size-3.5')} />
      </button>
    </span>
  )
}
