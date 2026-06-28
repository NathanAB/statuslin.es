import type * as React from 'react'

export type Gap = 1 | 1.5 | 2 | 3 | 4 | 6 | 9

// Full literal class strings — never string-build `gap-${gap}` (Tailwind can't see
// dynamic names; only complete literals survive the content scan).
const GAP_CLASS_X: Record<Gap, string> = {
  1: 'gap-x-1',
  // biome-ignore lint/style/useNamingConvention: 1.5 is a Gap scale value, not an identifier.
  1.5: 'gap-x-1.5',
  2: 'gap-x-2',
  3: 'gap-x-3',
  4: 'gap-x-4',
  6: 'gap-x-6',
  9: 'gap-x-9',
}
const GAP_CLASS_Y: Record<Gap, string> = {
  1: 'gap-y-1',
  // biome-ignore lint/style/useNamingConvention: 1.5 is a Gap scale value, not an identifier.
  1.5: 'gap-y-1.5',
  2: 'gap-y-2',
  3: 'gap-y-3',
  4: 'gap-y-4',
  6: 'gap-y-6',
  9: 'gap-y-9',
}

/** Vertical flex column. Spacing between sections is the parent's job — pick a `gap`.
 *  `minW0` lets children truncate inside a flex row (flex items default to min-width:auto). */
export function Stack({
  gap,
  minW0 = false,
  children,
}: {
  gap: Gap
  minW0?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col ${minW0 ? 'min-w-0' : ''} ${GAP_CLASS_Y[gap]}`}>{children}</div>
  )
}

const ALIGN_CLASS = {
  start: 'items-start',
  center: 'items-center',
} as const

const JUSTIFY_CLASS = {
  start: 'justify-start',
  between: 'justify-between',
  center: 'justify-center',
} as const

/** Horizontal flex row. `align` defaults to center (the common title/footer case).
 *  `aboveOverlay` stacks the row over a sibling StretchedLink overlay inside an
 *  interactive Card, so its buttons/links stay clickable (relative z-10 shrink-0). */
export function Row({
  gap,
  align = 'center',
  justify = 'start',
  wrap = false,
  aboveOverlay = false,
  children,
}: {
  gap: Gap
  align?: 'start' | 'center'
  justify?: 'start' | 'between' | 'center'
  wrap?: boolean
  aboveOverlay?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex ${wrap ? 'flex-wrap' : ''} ${aboveOverlay ? 'relative z-10 shrink-0' : ''} ${ALIGN_CLASS[align]} ${JUSTIFY_CLASS[justify]} ${GAP_CLASS_X[gap]}`}
    >
      {children}
    </div>
  )
}

/**
 * THE escape hatch — a plain div that takes an arbitrary class string.
 * Every use is a design-system gap, not a convenience. Each call site MUST carry a
 * `// REASON:` comment on the preceding line (gate-enforced) explaining why no
 * named primitive fits. Reach for a real primitive first.
 */
export function Box({
  UNSAFE_className,
  children,
}: {
  // biome-ignore lint/style/useNamingConvention: UNSAFE_ prefix is the intentional, greppable escape-hatch convention (per design-system spec).
  UNSAFE_className: string
  children: React.ReactNode
}) {
  return <div className={UNSAFE_className}>{children}</div>
}
