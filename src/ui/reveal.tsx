import { type ReactNode, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/reduced-motion'

// A block shows once its top passes this far down the window.
const SHOW_AT = 0.92

// Every block still waiting, checked by one scroll listener. A block the page jumped past (the
// End key, a link to a section further down) counts as reached, so nothing stays hidden.
const waiting = new Map<Element, () => void>()
let frame = 0

function check() {
  frame = 0
  for (const [element, show] of waiting) {
    if (element.getBoundingClientRect().top < window.innerHeight * SHOW_AT) {
      waiting.delete(element)
      show()
    }
  }
  if (waiting.size === 0) stopListening()
}

function schedule() {
  if (!frame) frame = window.requestAnimationFrame(check)
}

function stopListening() {
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
}

function wait(element: Element, show: () => void): () => void {
  if (waiting.size === 0) {
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
  }
  waiting.set(element, show)
  return () => {
    waiting.delete(element)
    if (waiting.size === 0) stopListening()
  }
}

/**
 * A block that rises into place the first time it scrolls into view. Only a block that starts below
 * the fold waits, and only after the page runs and the visitor allows motion, so nothing is ever
 * hidden at rest or without JavaScript: the server renders it in place.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'waiting' | 'shown' | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (prefersReducedMotion()) return
    if (element.getBoundingClientRect().top < window.innerHeight * SHOW_AT) return
    setState('waiting')
    return wait(element, () => setState('shown'))
  }, [])

  return (
    <div
      ref={ref}
      data-reveal={state ?? undefined}
      className="transition-[opacity,translate] duration-1000 ease-settle data-[reveal=waiting]:translate-y-7 data-[reveal=waiting]:opacity-0 print:data-[reveal=waiting]:translate-y-0 print:data-[reveal=waiting]:opacity-100"
    >
      {children}
    </div>
  )
}
