import { Link, type LinkProps } from '@tanstack/react-router'
import type * as React from 'react'

import { cn } from '@/lib/cn'
import { prefersReducedMotion } from '@/lib/reduced-motion'

/**
 * Page and section headings. `level` is the only knob: it picks both the semantic tag
 * (h1/h2/h3) and a fixed size on one scale. Each level's look is defined once here, so
 * the same level can never render differently on two pages, and headings are never
 * monospace. Level 3 is the card / section-card title. `size="compact"` is the quiet
 * title for a page whose wordmark already carries the visual weight. `size="display"` is the home
 * hero's title; `size="subsection"` a directory page's section title (/resources), at statement size.
 */
const HEADING_CLASS = {
  1: 'text-2xl font-semibold text-foreground',
  2: 'text-lg font-semibold text-foreground',
  3: 'text-base font-medium leading-snug text-foreground',
} as const
const COMPACT_HEADING_CLASS = 'text-lg font-medium leading-snug text-foreground'
// The home hero's page title, on the redesign's largest size.
const DISPLAY_HEADING_CLASS = 'text-balance font-semibold text-display text-foreground'
// A directory page's section title (/resources): the redesign's statement size, set bold.
const SUBSECTION_HEADING_CLASS = 'text-balance font-semibold text-foreground text-lead'

export function Heading({
  level,
  size = 'default',
  id,
  children,
}: {
  level: 1 | 2 | 3
  size?: 'default' | 'compact' | 'display' | 'subsection'
  id?: string | undefined
  children: React.ReactNode
}) {
  const className =
    size === 'compact'
      ? COMPACT_HEADING_CLASS
      : size === 'display'
        ? DISPLAY_HEADING_CLASS
        : size === 'subsection'
          ? SUBSECTION_HEADING_CLASS
          : HEADING_CLASS[level]
  if (level === 1)
    return (
      <h1 id={id} className={className}>
        {children}
      </h1>
    )
  if (level === 2)
    return (
      <h2 id={id} className={className}>
        {children}
      </h2>
    )
  return (
    <h3 id={id} className={className}>
      {children}
    </h3>
  )
}

/**
 * Every piece of non-heading text goes through here, so size, color, and font live in
 * one place. `size` is a closed scale; `muted` dims the color; `mono` is for code/data
 * values (slugs, hashes); `inheritColor` keeps the color around it (code inside a caution fact);
 * and `inline` renders a span instead of a paragraph.
 */
export function Text({
  muted = false,
  size = 'base',
  mono = false,
  inheritColor = false,
  inline = false,
  center = false,
  breakLong = false,
  children,
}: {
  muted?: boolean
  size?: 'base' | 'sm' | 'xs'
  mono?: boolean
  inheritColor?: boolean
  inline?: boolean
  children: React.ReactNode
  center?: boolean
  // Break long unbreakable tokens (e.g. URLs) so the text can shrink inside a flex
  // row instead of forcing horizontal overflow. `min-w-0` lets it shrink past its
  // intrinsic width; `wrap-anywhere` (overflow-wrap:anywhere) collapses min-content.
  breakLong?: boolean
}) {
  const className = cn(
    !inheritColor && (muted ? 'text-muted-foreground' : 'text-foreground'),
    size === 'sm' && 'text-sm',
    size === 'xs' && 'text-xs',
    mono && 'font-mono',
    center && 'self-center text-center',
    breakLong && 'wrap-anywhere min-w-0',
  )
  return inline ? (
    <span className={className}>{children}</span>
  ) : (
    <p className={className}>{children}</p>
  )
}

type LinkTone = 'accent' | 'plain' | 'muted' | 'underlined'

const LINK_TONE_CLASS: Record<LinkTone, string> = {
  accent: 'text-primary',
  plain: 'text-foreground',
  muted: 'text-muted-foreground hover:text-foreground',
  // Full-strength text, underlined even at rest: a link that stands alone beside a button.
  underlined:
    'text-foreground underline decoration-foreground/35 transition-[text-decoration-color] duration-400 ease-settle hover:decoration-foreground',
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
      params?: LinkProps['params']
      // An element id on the target page; the router scrolls to it after navigating.
      hash?: string
      href?: never
      children: React.ReactNode
      target?: string
      rel?: string
      // 'inherit' (default) emits no text-size class, so the link matches the surrounding
      // sentence; 'sm' keeps a fixed-small look.
      size?: 'inherit' | 'sm'
      // 'accent' (default) is the coral link; 'plain' is full-strength text (the footer);
      // 'muted' is dimmed text that lights up on hover (a gallery card's tags); 'underlined' is
      // full-strength text underlined at rest (the hero's "Open page" link).
      tone?: LinkTone
    }
  // External URL; opens in a new tab. Use instead of `to` for off-site links (e.g. docs).
  | {
      href: string
      to?: never
      search?: never
      params?: never
      hash?: never
      children: React.ReactNode
      target?: string
      rel?: string
      size?: 'inherit' | 'sm'
      tone?: LinkTone
      onClick?: () => void
    }

/** Glide to a hash target, or jump when the reader asks for reduced motion. */
function hashScrollOptions(): ScrollIntoViewOptions {
  return { behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }
}

export function TextLink(props: TextLinkProps) {
  const className = cn(
    'underline-offset-4 hover:underline',
    LINK_TONE_CLASS[props.tone ?? 'accent'],
    props.size === 'sm' && 'text-sm',
  )
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
        onClick={props.onClick}
        className={className}
      >
        {props.children}
      </a>
    )
  }
  return (
    // Only the page itself is the current page: a breadcrumb to a parent (Mods, Status lines) must
    // not announce aria-current="page" on the pages under it.
    <Link
      to={props.to}
      activeOptions={{ exact: true }}
      {...(props.search !== undefined ? { search: props.search } : {})}
      {...(props.params !== undefined ? { params: props.params } : {})}
      {...(props.hash !== undefined
        ? { hash: props.hash, hashScrollIntoView: hashScrollOptions() }
        : {})}
      className={className}
    >
      {props.children}
    </Link>
  )
}
