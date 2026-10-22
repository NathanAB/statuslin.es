/** Whether the visitor asked for less motion. False on the server, where there is no visitor. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/** Glide to a hash target, or jump when the reader asks for reduced motion. */
export function hashScrollOptions(): ScrollIntoViewOptions {
  return { behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }
}
