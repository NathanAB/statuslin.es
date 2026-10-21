import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

// What a look stacks: the terminal's one <pre>, or Desktop's messages with a gap between.
const INNER = {
  terminal: 'shrink-0',
  desktop: 'flex shrink-0 flex-col gap-3',
} as const

/**
 * A conversation held to the bottom of its space, newest last, as a terminal or a chat scrolls:
 * what doesn't fit is the oldest, clipped at the top. Once it clips, the top edge fades out, so no
 * line reads as cut in half. Re-measured when the space or the conversation resizes.
 */
export function BottomAnchored({
  look,
  settle,
  children,
}: {
  look: keyof typeof INNER
  /** The entrance class a new conversation settles in with, if any. */
  settle?: string | undefined
  children: ReactNode
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [clips, setClips] = useState(false)
  useLayoutEffect(() => {
    const space = outer.current
    const content = inner.current
    if (!space || !content) return
    const measure = () => setClips(content.offsetHeight > space.clientHeight + 1)
    measure()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resize?.observe(space)
    resize?.observe(content)
    return () => resize?.disconnect()
  }, [])
  return (
    <div
      ref={outer}
      className={cn(
        'flex min-h-0 shrink flex-col justify-end overflow-hidden',
        clips && '[mask-image:linear-gradient(to_bottom,transparent,black_2.5rem)]',
        settle,
      )}
    >
      <div ref={inner} className={INNER[look]}>
        {children}
      </div>
    </div>
  )
}
