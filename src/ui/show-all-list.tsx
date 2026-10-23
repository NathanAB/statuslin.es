import { ChevronDown } from 'lucide-react'
import { Children, type ReactNode, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Button } from '@/ui/button'
import { GalleryList } from '@/ui/gallery-row'
import { Row, Stack } from '@/ui/layout'

/**
 * A gallery list that shows its first `shown` rows, then a "Show all N" button for the rest. Every
 * row is in the page's HTML, so crawlers read them all; the rest are hidden until the click. The
 * button then leaves and puts focus on the first row it showed, so a keyboard reader carries on
 * from there.
 */
export function ShowAllList({ shown, children }: { shown: number; children: ReactNode }) {
  const rows = Children.toArray(children)
  const rest = rows.slice(shown)
  const [expanded, setExpanded] = useState(false)
  const restId = useId()
  const restRef = useRef<HTMLDivElement>(null)

  const showAll = () => {
    flushSync(() => setExpanded(true))
    restRef.current?.querySelector<HTMLElement>('a[href], button')?.focus()
  }

  return (
    <Stack gap={6}>
      <GalleryList>
        {rows.slice(0, shown)}
        {rest.length > 0 ? (
          // `contents` keeps the rest as rows of the list, so its gaps space them.
          <div ref={restRef} id={restId} hidden={!expanded} className="contents">
            {rest}
          </div>
        ) : null}
      </GalleryList>
      {rest.length > 0 && !expanded ? (
        <Row gap={3} justify="center">
          <Button asChild variant="secondary" size="pill" trailingIcon={<ChevronDown />}>
            <button type="button" aria-expanded={false} aria-controls={restId} onClick={showAll}>
              Show all {rows.length}
            </button>
          </Button>
        </Row>
      ) : null}
    </Stack>
  )
}
