// The parts the home hero's two screens (src/ui/terminal.tsx, src/ui/desktop-screen.tsx) share.

// After a change, new content settles in from just below. Motion only when the visitor allows it.
export const SETTLE =
  'motion-safe:animate-in motion-safe:fade-in-1 motion-safe:slide-in-from-bottom-1.5 motion-safe:duration-700 motion-safe:ease-settle'

/** A new pick glows for a moment. */
export const GLOW = 'motion-safe:animate-flash'

// Both screens keep one fixed height, so nothing below moves when the app changes.
export const SCREEN =
  'flex h-[clamp(23.75rem,31vw,27.875rem)] flex-col justify-end overflow-hidden rounded-screen px-6 pt-5.5 pb-5 max-md:h-72 max-md:px-4 max-md:pt-4 max-md:pb-3.5'

/**
 * Nothing moves on the first render. Once `conversationChanged`, each new conversation (named by
 * `conversationKey`) settles in; once `drawnChanged`, each new pick (named by `drawnKey`) glows.
 */
export interface ScreenMotion {
  conversationKey: string
  conversationChanged: boolean
  drawnKey: string
  drawnChanged: boolean
}
