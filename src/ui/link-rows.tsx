import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Heading } from '@/ui/text'

/** One row: its name (usually a StretchedLink, so the whole row opens it), what it is, and a note. */
export interface LinkRow {
  key: string
  /** The name's heading id, for links to this row. */
  id?: string
  title: ReactNode
  /** A small note under the name, such as where the link goes or a second link. */
  meta?: ReactNode
  description: string
}

/**
 * A list of outside resources set as text, not boxes: each row's name at heading weight with its
 * note under it, and its description beside them once the row is wide enough (under them when it
 * isn't, as in a narrow column). A row lifts a tone on hover or when its link has focus, so it reads
 * as one target. `columns={2}` sets the rows two up on wide screens, each with its text stacked.
 */
export function LinkRows({ items, columns = 1 }: { items: LinkRow[]; columns?: 1 | 2 }) {
  return (
    <ul className={cn('grid gap-1', columns === 2 && 'lg:grid-cols-2 lg:gap-x-6')}>
      {items.map((item) => (
        <li
          key={item.key}
          className="@container relative -mx-4 rounded-panel px-4 py-4.5 transition-colors duration-300 hover:bg-foreground/4 has-[a:focus-visible]:bg-foreground/4 min-[56.25rem]:-mx-5 min-[56.25rem]:px-5"
        >
          <div
            className={cn(
              'grid gap-x-8 gap-y-1.5',
              columns === 1 && '@xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
            )}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <Heading level={3} size="compact" id={item.id}>
                {item.title}
              </Heading>
              {item.meta ? (
                <div className="w-fit text-muted-foreground text-small [&_a]:relative [&_a]:z-10">
                  {item.meta}
                </div>
              ) : null}
            </div>
            <p className="text-body text-foreground">{item.description}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
