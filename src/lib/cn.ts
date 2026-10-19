import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The text sizes, radii, easing, spacing and widths app.css adds, so merging knows text-body is a
// size (not a colour to drop text-foreground for). test/lib/cn.test.ts fails when app.css adds one
// not listed.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['small', 'body', 'lead', 'heading', 'display'],
      radius: ['frame', 'screen', 'tile', 'panel'],
      ease: ['settle'],
      spacing: ['gutter', 'section'],
      container: ['page'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
