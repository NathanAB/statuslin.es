import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Text } from '@/ui/text'

export interface FactTile {
  icon: LucideIcon
  label: string
  /** A short value. Backticks mark code: "`/burn`". */
  value: string
  /** A cost or a risk, drawn in the warning tint. */
  caution?: boolean
}

/**
 * Small label/value tiles in a responsive grid: one column on a phone, up to three on a wide
 * screen. Each reads as a description-list pair, its icon beside the muted label, on one
 * borderless surface (a caution tile in the warning tint).
 */
export function FactTiles({ tiles }: { tiles: FactTile[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map(({ icon: Icon, label, value, caution = false }) => (
        <div
          key={label}
          data-tone={caution ? 'caution' : 'plain'}
          className={cn(
            'flex flex-col gap-1 rounded-tile px-4 py-3.5',
            caution ? 'bg-warning/10' : 'bg-card',
          )}
        >
          <dt className="flex items-center gap-2">
            <Icon
              className={cn('size-4 shrink-0', caution ? 'text-warning' : 'text-muted-foreground')}
              aria-hidden="true"
            />
            <Text muted size="xs" inline>
              {label}
            </Text>
          </dt>
          <dd className="min-w-0 break-words pl-6">
            <Text size="sm" inline>
              <InlineCodeText text={value} />
            </Text>
          </dd>
        </div>
      ))}
    </dl>
  )
}
