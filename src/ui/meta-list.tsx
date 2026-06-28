import type * as React from 'react'
import { Fragment } from 'react'

import { Text } from '@/ui/text'

export interface MetaEntry {
  label: string
  value: React.ReactNode
  /** Monospace the value — for ids, slugs, hashes. */
  mono?: boolean
}

/**
 * Two-column label/value grid for scannable metadata (admin dashboard rows). Dim labels on the
 * left, foreground values on the right; long values wrap. Replaces dot-separated metadata runs
 * that read as a wall of text.
 */
export function MetaList({ items }: { items: MetaEntry[] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt>
            <Text muted size="sm" inline>
              {item.label}
            </Text>
          </dt>
          <dd className="min-w-0 break-words">
            <Text size="sm" mono={item.mono ?? false} inline>
              {item.value}
            </Text>
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}
