import type { ReactNode } from 'react'

/**
 * Renders text that's available to screen readers and crawlers but invisible on screen
 * (Tailwind's `sr-only`). Lets routes add keyword/heading text without a raw `className`
 * (which the frontend boundary rule forbids outside `src/ui`). `as` is intentionally narrow —
 * only the tags used today.
 */
export function VisuallyHidden({
  as: Tag = 'span',
  id,
  children,
}: {
  as?: 'span' | 'h2'
  /** For an element named by this text (`aria-labelledby`), such as a list with no visible title. */
  id?: string
  children: ReactNode
}) {
  return (
    <Tag id={id} className="sr-only">
      {children}
    </Tag>
  )
}

/**
 * A message only screen readers hear, read out politely each time it changes (role="status"):
 * what an interactive demo now shows. Keep it empty until the visitor changes something.
 */
export function LiveMessage({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  )
}
