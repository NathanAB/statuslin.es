import { Link, type LinkProps } from '@tanstack/react-router'
import type * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * Page and section headings. `level` is the only knob: it picks both the semantic tag
 * (h1/h2/h3) and a fixed size on one scale. Each level's look is defined once here, so
 * the same level can never render differently on two pages, and headings are never
 * monospace. Level 3 is the card / section-card title.
 */
const HEADING_CLASS = {
  1: 'text-2xl font-semibold text-foreground',
  2: 'text-lg font-semibold text-foreground',
  3: 'text-base font-medium leading-snug text-foreground',
} as const

export function Heading({ level, children }: { level: 1 | 2 | 3; children: React.ReactNode }) {
  const className = HEADING_CLASS[level]
  if (level === 1) return <h1 className={className}>{children}</h1>
  if (level === 2) return <h2 className={className}>{children}</h2>
  return <h3 className={className}>{children}</h3>
}

/**
 * Every piece of non-heading text goes through here, so size, color, and font live in
 * one place. `size` is a closed scale; `muted` dims the color; `mono` is for code/data
 * values (slugs, hashes); `inline` renders a span instead of a paragraph; `measure`
 * caps the line length for readable paragraphs.
 */
export function Text({
  muted = false,
  size = 'base',
  mono = false,
  inline = false,
  measure = false,
  center = false,
  children,
}: {
  muted?: boolean
  size?: 'base' | 'sm' | 'xs'
  mono?: boolean
  inline?: boolean
  measure?: boolean
  children: React.ReactNode
  center?: boolean
}) {
  const className = cn(
    muted ? 'text-muted-foreground' : 'text-foreground',
    size === 'sm' && 'text-sm',
    size === 'xs' && 'text-xs',
    mono && 'font-mono',
    measure && 'max-w-2xl',
    center && 'self-center text-center',
  )
  return inline ? (
    <span className={className}>{children}</span>
  ) : (
    <p className={className}>{children}</p>
  )
}

/**
 * Inline router link with the primary-underline styling ("Back to gallery",
 * "Sign in to submit"). `to`/`search` are typed against the registered route table
 * via `LinkProps`; `search` is only forwarded when provided.
 */
type TextLinkProps =
  | {
      to: NonNullable<LinkProps['to']>
      search?: LinkProps['search']
      href?: never
      children: React.ReactNode
      target?: string
      rel?: string
    }
  // External URL; opens in a new tab. Use instead of `to` for off-site links (e.g. docs).
  | {
      href: string
      to?: never
      search?: never
      children: React.ReactNode
      target?: string
      rel?: string
    }

export function TextLink(props: TextLinkProps) {
  const className = 'text-primary text-sm underline-offset-4 hover:underline'
  if (props.href !== undefined) {
    // Only http(s) links navigate to another page, so only they open in a new tab.
    // mailto:/tel: launch an external handler — a "new tab" is meaningless there.
    const opensInNewTab = /^https?:\/\//.test(props.href)
    return (
      <a
        href={props.href}
        target={props.target}
        rel={props.rel}
        {...(opensInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={className}
      >
        {props.children}
      </a>
    )
  }
  return (
    <Link
      to={props.to}
      {...(props.search !== undefined ? { search: props.search } : {})}
      className={className}
    >
      {props.children}
    </Link>
  )
}
