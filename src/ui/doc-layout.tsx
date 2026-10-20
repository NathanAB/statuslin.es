import { type ReactNode, useEffect, useId, useRef } from 'react'
import { cn } from '@/lib/cn'
import { useActiveSection } from '@/ui/use-active-section'

export interface ContentsEntry {
  /** The id of the section the entry links to. */
  id: string
  title: string
  children?: readonly ContentsEntry[]
}

const entryIds = (entries: readonly ContentsEntry[]): string[] =>
  entries.flatMap((entry) => [entry.id, ...entryIds(entry.children ?? [])])

function ContentsList({
  entries,
  active,
  nested = false,
}: {
  entries: readonly ContentsEntry[]
  active: string | null
  nested?: boolean
}) {
  return (
    <ul className={nested ? 'mt-2 flex flex-col gap-2 pl-4' : 'flex flex-col gap-2'}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            data-entry={entry.id}
            aria-current={entry.id === active ? 'location' : undefined}
            className={cn(
              'text-sm underline-offset-4 transition-colors duration-300 ease-settle hover:text-foreground hover:underline',
              entry.id === active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {entry.title}
          </a>
          {entry.children ? <ContentsList entries={entry.children} active={active} nested /> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * The contents list, following the reader: the section being read is marked current, and a coral
 * marker slides along the rail beside the list to its entry. The marker's place is measured from
 * the entry, so it's set as two CSS variables rather than a style prop.
 */
function Contents({ entries }: { entries: readonly ContentsEntry[] }) {
  const active = useActiveSection(entryIds(entries))
  const list = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const entry = [...(list.current?.querySelectorAll<HTMLElement>('[data-entry]') ?? [])].find(
      (link) => link.dataset.entry === active,
    )
    const bar = marker.current
    if (!bar) return
    bar.dataset.shown = entry ? 'true' : 'false'
    if (!entry) return
    bar.style.setProperty('--marker-y', `${entry.offsetTop}px`)
    bar.style.setProperty('--marker-h', `${entry.offsetHeight}px`)
  }, [active])

  return (
    <div ref={list} className="relative pl-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-border" />
      <span
        ref={marker}
        aria-hidden="true"
        data-shown="false"
        className="absolute top-0 left-0 h-(--marker-h) w-0.5 -translate-x-[0.5px] translate-y-(--marker-y) rounded-full bg-primary-fill opacity-0 data-[shown=true]:opacity-100 motion-safe:transition-[translate,height,opacity] motion-safe:duration-400 motion-safe:ease-settle"
      />
      <ContentsList entries={entries} active={active} />
    </div>
  )
}

/**
 * A long page with a contents list (the guide). From 1280px the list takes the column's first three
 * of twelve columns and stays in view while the page scrolls, marking the section being read; the
 * intro and body take the other nine, at their full width. Below that the list sits between the
 * intro and the body. A page with the list scrolls smoothly to the entry picked (app.css).
 */
export function DocLayout({
  intro,
  contents,
  children,
}: {
  intro: ReactNode
  contents: readonly ContentsEntry[]
  children: ReactNode
}) {
  const labelId = useId()
  return (
    <div className="grid grid-cols-1 gap-y-6 xl:grid-cols-12 xl:gap-x-6">
      <div className="min-w-0 xl:col-span-9 xl:col-start-4 xl:row-start-1">{intro}</div>
      <nav
        aria-labelledby={labelId}
        data-doc-contents
        className="xl:col-span-3 xl:col-start-1 xl:row-span-2 xl:row-start-1"
      >
        <div className="flex flex-col gap-3 xl:sticky xl:top-8">
          <p id={labelId} className="font-medium text-foreground text-sm">
            On this page
          </p>
          <Contents entries={contents} />
        </div>
      </nav>
      <div className="min-w-0 xl:col-span-9 xl:col-start-4 xl:row-start-2">{children}</div>
    </div>
  )
}
