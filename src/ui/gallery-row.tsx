import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ABOVE_OVERLAY_CLASS } from '@/ui/layout'

// The row lights up while its title link has keyboard focus, as it does under the pointer. Every
// class is a full literal, so Tailwind's scan finds it.
const ROW_CLASS =
  'relative flex min-w-0 flex-col gap-3.5 rounded-panel bg-card px-4.5 pt-4.5 pb-6 transition-colors duration-500 ease-settle hover:bg-muted sm:px-6 in-data-[slot=card]:bg-muted in-data-[slot=card]:hover:bg-border has-[[data-row-link]:focus-visible]:bg-muted has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:outline-foreground has-[[data-row-link]:focus-visible]:outline-offset-3 in-data-[slot=card]:has-[[data-row-link]:focus-visible]:bg-border'

/**
 * One gallery card, laid out as a full-width row on one surface tone. The top line holds the title
 * and the byline on the left and the row's facts on the right; the preview sits below, then the
 * description: two lines at most on screen, the whole text in the page. The title link opens the
 * row from anywhere on it (its overlay covers the row); the byline and facts stay clickable above
 * that overlay. Hover and keyboard focus raise the tone; nothing moves. Inside another card (a
 * related list) the row starts one tone up, so it still reads as a row.
 */
export function GalleryRow({
  to,
  params,
  onOpen,
  title,
  byline,
  facts,
  description,
  children,
}: {
  to: NonNullable<LinkProps['to']>
  params?: LinkProps['params']
  onOpen?: () => void
  title: string
  byline?: ReactNode
  facts: ReactNode
  /** Left out where the list has none (a status line page's "More status lines"). */
  description?: string
  /** The preview: the status line, or a mod's Claude Desktop shot. */
  children: ReactNode
}) {
  return (
    <article data-slot="gallery-row" className={ROW_CLASS}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h3 className="font-medium text-body text-foreground tracking-[-0.01em]">
            <Link
              to={to}
              {...(params !== undefined ? { params } : {})}
              onClick={onOpen}
              data-row-link=""
              className="outline-none after:absolute after:inset-0 after:rounded-[inherit]"
            >
              {title}
            </Link>
          </h3>
          {byline ? <div className={ABOVE_OVERLAY_CLASS}>{byline}</div> : null}
        </div>
        <div className={ABOVE_OVERLAY_CLASS}>{facts}</div>
      </div>
      <div className="min-w-0">{children}</div>
      {description ? (
        <p className="wrap-anywhere line-clamp-2 text-base text-muted-foreground">{description}</p>
      ) : null}
    </article>
  )
}

/**
 * A row's facts in a quiet line, a dot between each. A list, so a screen reader keeps the facts
 * apart; the dots are decoration, so unspoken.
 */
export function RowFacts({ children }: { children: ReactNode[] }) {
  return (
    <ul className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground text-small tabular-nums">
      {children.map((fact, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list with no other identity.
        <li key={i} className="flex items-baseline gap-x-1.5">
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          <span>{fact}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The gallery's rows, stacked close: one surface tone each, so the gaps draw the rows apart.
 * `animateChanges` moves the rows in a view transition: rows that stay slide to their new place,
 * new rows rise in, leaving rows fade out (the timing is in app.css). `match-element` names each
 * row by its DOM node, so React's keyed rows keep their identity across the update.
 */
export function GalleryList({
  animateChanges = false,
  children,
}: {
  animateChanges?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5',
        animateChanges &&
          '[&_[data-slot=gallery-row]]:[view-transition-class:gallery-row] [&_[data-slot=gallery-row]]:[view-transition-name:match-element]',
      )}
    >
      {children}
    </div>
  )
}
