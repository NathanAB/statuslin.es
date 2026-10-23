import { cn } from '@/lib/cn'

/**
 * A control's label that swaps to another (Copy → Copied) without changing the control's width:
 * both sit in one grid cell, so the wider one sets the width, and the one not shown stays there,
 * invisible and hidden from screen readers.
 */
export function SwapLabel({
  label,
  swapped,
  swappedLabel,
}: {
  label: string
  swapped: boolean
  swappedLabel: string
}) {
  return (
    <span className="inline-grid justify-items-center">
      <span
        aria-hidden={swapped || undefined}
        className={cn('[grid-area:1/1]', swapped && 'invisible')}
      >
        {label}
      </span>
      <span
        aria-hidden={!swapped || undefined}
        className={cn('[grid-area:1/1]', !swapped && 'invisible')}
      >
        {swappedLabel}
      </span>
    </span>
  )
}
