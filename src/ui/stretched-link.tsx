import { Link, type LinkProps } from '@tanstack/react-router'
import type * as React from 'react'

/**
 * The gallery-card title link that makes the whole card clickable via an
 * `after` overlay covering the nearest positioned ancestor.
 *
 * Requirements at the call site:
 *  - the parent card must be `relative` (use `<Card interactive>`, which is).
 *  - any other interactive element inside the card must sit above the overlay
 *    with `z-10` so it stays clickable (the gallery footer chips do this).
 */
export function StretchedLink({
  to,
  params,
  children,
}: {
  to: NonNullable<LinkProps['to']>
  params: LinkProps['params']
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      {...(params !== undefined ? { params } : {})}
      className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </Link>
  )
}
