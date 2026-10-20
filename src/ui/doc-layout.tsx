import { type ReactNode, useId } from 'react'
import { TextLink } from '@/ui/text'

export interface ContentsEntry {
  /** The id of the section the entry links to. */
  id: string
  title: string
  children?: readonly ContentsEntry[]
}

function ContentsList({
  entries,
  nested = false,
}: {
  entries: readonly ContentsEntry[]
  nested?: boolean
}) {
  return (
    <ul className={nested ? 'mt-2 flex flex-col gap-2 pl-4' : 'flex flex-col gap-2'}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <TextLink href={`#${entry.id}`} tone="muted" size="sm">
            {entry.title}
          </TextLink>
          {entry.children ? <ContentsList entries={entry.children} nested /> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * A long page with a contents list (the guide). From 1280px the list takes the column's first three
 * of twelve columns and stays in view while the page scrolls; the intro and body take the other
 * nine, at their full width. Below that the list sits between the intro and the body.
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
        className="xl:col-span-3 xl:col-start-1 xl:row-span-2 xl:row-start-1"
      >
        <div className="flex flex-col gap-3 xl:sticky xl:top-8">
          <p id={labelId} className="font-medium text-foreground text-sm">
            On this page
          </p>
          <ContentsList entries={contents} />
        </div>
      </nav>
      <div className="min-w-0 xl:col-span-9 xl:col-start-4 xl:row-start-2">{children}</div>
    </div>
  )
}
