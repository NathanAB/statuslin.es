import type { ReactNode } from 'react'

/**
 * Renders text that's available to screen readers and crawlers but invisible on screen
 * (Tailwind's `sr-only`). Lets routes add keyword/heading text without a raw `className`
 * (which the frontend boundary rule forbids outside `src/ui`). `as` is intentionally narrow —
 * only the tags used today.
 */
export function VisuallyHidden({
  as: Tag = 'span',
  children,
}: {
  as?: 'span' | 'h2'
  children: ReactNode
}) {
  return <Tag className="sr-only">{children}</Tag>
}
