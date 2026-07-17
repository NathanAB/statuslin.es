import { Link, type LinkProps } from '@tanstack/react-router'
import type * as React from 'react'

const STRETCHED_LINK_CLASS =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

type StretchedLinkProps = {
  children: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
} & (
  | {
      to: NonNullable<LinkProps['to']>
      params?: LinkProps['params']
      href?: never
    }
  // External URL; opens in a new tab. Use instead of `to` for off-site links (e.g. resource cards).
  | {
      href: string
      to?: never
      params?: never
    }
)
/**
 * The gallery-card title link that makes the whole card clickable via an
 * `after` overlay covering the nearest positioned ancestor.
 *
 * Requirements at the call site:
 *  - the parent card must be `relative` (use `<Card interactive>`, which is).
 *  - any other interactive element inside the card must sit above the overlay
 *    with `z-10` so it stays clickable (the gallery footer chips do this).
 */
export function StretchedLink(props: StretchedLinkProps) {
  if (props.href !== undefined) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className={STRETCHED_LINK_CLASS}
        onClick={props.onClick}
      >
        {props.children}
      </a>
    )
  }
  return (
    <Link
      to={props.to}
      {...(props.params !== undefined ? { params: props.params } : {})}
      className={STRETCHED_LINK_CLASS}
      onClick={props.onClick}
    >
      {props.children}
    </Link>
  )
}
