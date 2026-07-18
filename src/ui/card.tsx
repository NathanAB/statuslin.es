import type * as React from 'react'

import { cn } from '@/lib/cn'
import { Heading, Text } from '@/ui/text'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket DOM spread.
// Card pieces are pure layout containers — they take only `children` (plus Card's
// own `size`/`interactive` variants).

// The gallery hover/entrance set (verbatim from index.tsx). `relative` + the z-10
// stacking on interactive children makes a StretchedLink overlay work; interactive
// siblings inside the card must carry `z-10` to stay clickable above the overlay.
const INTERACTIVE_CARD =
  'fade-in slide-in-from-bottom-2 relative animate-in transition-all duration-150 focus-within:ring-3 focus-within:ring-primary/40 hover:ring-3 hover:ring-primary/40 motion-reduce:animate-none'

function Card({
  size = 'default',
  interactive = false,
  children,
}: {
  size?: 'default' | 'sm'
  interactive?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-card-foreground text-sm ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-[>img:first-child]:pt-0 has-data-[slot=card-footer]:pb-0 data-[size=sm]:has-data-[slot=card-footer]:pb-0 data-[size=sm]:[--card-spacing:--spacing(3)] *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        interactive && INTERACTIVE_CARD,
      )}
    >
      {children}
    </div>
  )
}

function CardHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-slot="card-header"
      className="group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)"
    >
      {children}
    </div>
  )
}

// The card / section-card title. Card titles default to h3; top-level page sections can opt into
// h2 without bypassing this closed component or restating heading styles.
function CardTitle({ level = 3, children }: { level?: 2 | 3; children?: React.ReactNode }) {
  return <Heading level={level}>{children}</Heading>
}

// data-slot stays on the wrapper because CardHeader's grid selects it; the text itself
// goes through Text so no card styling restates muted/size by hand.
function CardDescription({ children }: { children?: React.ReactNode }) {
  return (
    <div data-slot="card-description">
      <Text muted size="sm">
        {children}
      </Text>
    </div>
  )
}

function CardAction({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-slot="card-action"
      className="col-start-2 row-span-2 row-start-1 self-start justify-self-end"
    >
      {children}
    </div>
  )
}

function CardContent({ children }: { children?: React.ReactNode }) {
  return (
    <div data-slot="card-content" className="px-(--card-spacing)">
      {children}
    </div>
  )
}

function CardFooter({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-slot="card-footer"
      className="flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)"
    >
      {children}
    </div>
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
