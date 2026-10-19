import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { prefersReducedMotion } from '@/lib/reduced-motion'
import { Button } from '@/ui/button'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { PAGE_MEASURE } from '@/ui/page-measure'
import { LiveMessage } from '@/ui/visually-hidden'

export interface CarouselItem {
  key: string
  to: NonNullable<LinkProps['to']>
  params?: LinkProps['params']
  onOpen?: () => void
  title: string
  description: string
  byline: string
  shot: DesktopShotImage
  alt: string
}

/**
 * Which panel's middle is closest to `centre` (all in the row's scroll coordinates), or -1 with
 * none. Nearest, not "crossing the centre", so a narrow shot at either end can still be lit.
 */
export function nearestToCentre(panels: Array<{ left: number; width: number }>, centre: number) {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  panels.forEach((panel, index) => {
    const distance = Math.abs(panel.left + panel.width / 2 - centre)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** Where the row must scroll to put `panel` in its middle. */
const centring = (list: HTMLElement, panel: HTMLElement) =>
  panel.offsetLeft + panel.offsetWidth / 2 - list.clientWidth / 2

/**
 * A dark full-width band of screenshots in a sideways row: the centred one is lit and named above
 * the row (its title, one sentence, its byline), the others dimmed. Scrolling the row, the
 * previous and next buttons, or the arrow keys on a shot move which one is lit. Every shot and the
 * lit title link to the item's page. Server-rendered with the first item lit.
 */
export function ShotCarousel({
  heading,
  lead,
  listLabel,
  items,
  more,
}: {
  heading: string
  lead: string
  /** Names the row for screen readers. */
  listLabel: string
  items: CarouselItem[]
  /** The link to everything (All N mods), beside the buttons. */
  more: ReactNode
}) {
  const [lit, setLit] = useState(0)
  // What the buttons or arrow keys last moved to, said aloud; scrolling by hand says nothing.
  const [announced, setAnnounced] = useState('')
  const row = useRef<HTMLUListElement>(null)
  // While the row glides to a chosen shot, the shots it passes don't light up on the way.
  const steering = useRef<{ index: number; until: number } | null>(null)

  useEffect(() => {
    const list = row.current
    if (!list) return
    // The row is padded so its narrowest shot can reach the middle; start with the first centred.
    const first = list.children[0] as HTMLElement | undefined
    if (first) list.scrollLeft = centring(list, first)
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const panels = [...list.children].map((panel) => ({
          left: (panel as HTMLElement).offsetLeft,
          width: (panel as HTMLElement).offsetWidth,
        }))
        const nearest = nearestToCentre(panels, list.scrollLeft + list.clientWidth / 2)
        const steer = steering.current
        if (steer && Date.now() < steer.until && nearest !== steer.index) return
        steering.current = null
        if (nearest >= 0) setLit(nearest)
      })
    }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      list.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const go = (index: number, focus = false) => {
    const next = Math.max(0, Math.min(items.length - 1, index))
    if (next === lit) return
    setLit(next)
    setAnnounced(`${items[next]?.title}, ${next + 1} of ${items.length}`)
    const list = row.current
    const panel = list?.children[next] as HTMLElement | undefined
    if (list && panel) {
      steering.current = { index: next, until: Date.now() + 1500 }
      list.scrollTo?.({
        left: centring(list, panel),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
      if (focus) panel.querySelector('a')?.focus({ preventScroll: true })
    }
  }

  if (items.length === 0) return null
  return (
    <section className="mt-section flex flex-col gap-[clamp(2.5rem,5vw,4.5rem)] bg-sunken py-[clamp(5rem,9vw,8.5rem)]">
      <div className={cn('grid grid-cols-12 items-start gap-6', PAGE_MEASURE.wide)}>
        <div className="col-span-12 min-[56.25rem]:col-span-4">
          <h2 className="mb-3.5 font-semibold text-foreground text-heading">{heading}</h2>
          <p className="text-body text-foreground">{lead}</p>
        </div>
        {/* Every item's text shares one grid cell, so the block is as tall as the longest and the
            row below never moves as the lit item changes. Only the lit one shows and is read out. */}
        <div data-slot="carousel-lit" className="col-span-12 grid min-[56.25rem]:col-span-4">
          {items.map((item, index) =>
            index === lit ? (
              <div key={item.key} className="col-start-1 row-start-1">
                <h3 className="mb-2 font-medium text-foreground text-lead tracking-[-0.02em]">
                  <Link
                    to={item.to}
                    {...(item.params !== undefined ? { params: item.params } : {})}
                    onClick={item.onOpen}
                    className="rounded-sm hover:underline hover:underline-offset-4"
                  >
                    {item.title}
                  </Link>
                </h3>
                <p className="line-clamp-4 text-body text-muted-foreground">{item.description}</p>
                <p className="mt-2.5 text-muted-foreground text-small">{item.byline}</p>
              </div>
            ) : (
              <div key={item.key} aria-hidden="true" className="invisible col-start-1 row-start-1">
                <p className="mb-2 font-medium text-lead tracking-[-0.02em]">{item.title}</p>
                <p className="line-clamp-4 text-body">{item.description}</p>
                <p className="mt-2.5 text-small">{item.byline}</p>
              </div>
            ),
          )}
        </div>
        <div className="col-span-12 flex items-center gap-2.5 justify-self-start min-[56.25rem]:col-span-4 min-[56.25rem]:justify-self-end">
          <Button
            type="button"
            variant="secondary"
            size="round"
            aria-label="Previous mod"
            aria-disabled={lit === 0}
            onClick={() => go(lit - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="round"
            aria-label="Next mod"
            aria-disabled={lit === items.length - 1}
            onClick={() => go(lit + 1)}
          >
            <ChevronRight />
          </Button>
          <span className="ml-3.5 text-body">{more}</span>
          <LiveMessage>{announced}</LiveMessage>
        </div>
      </div>
      <ul
        ref={row}
        aria-label={listLabel}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          go(lit + (event.key === 'ArrowRight' ? 1 : -1), true)
        }}
        className="flex snap-x snap-mandatory items-center gap-[min(6vw,5rem)] overflow-x-auto px-[max(1rem,calc(50vw-11.0625rem))] py-2 [scrollbar-width:none] max-md:gap-[7vw] max-md:px-[7vw] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, index) => (
          <li
            key={item.key}
            data-index={index}
            className={cn(
              'shrink-0 snap-center transition-[opacity,scale] duration-900 ease-settle motion-reduce:transition-none',
              index === lit ? 'opacity-100' : 'scale-94 opacity-22',
            )}
          >
            <Link
              to={item.to}
              {...(item.params !== undefined ? { params: item.params } : {})}
              onClick={item.onOpen}
              className="block w-fit max-w-[86vw] rounded-[1.375rem] bg-card p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span data-ui="" className="block overflow-hidden rounded-2xl">
                <img
                  src={item.shot.src}
                  alt={item.alt}
                  width={item.shot.width}
                  height={item.shot.height}
                  loading="lazy"
                  className="block h-auto max-w-full"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
