import { cva } from 'class-variance-authority'
import { ToggleGroup } from 'radix-ui'

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

const root = cva('', {
  variants: {
    look: {
      boxed: 'inline-flex h-9 items-stretch overflow-hidden rounded-md border border-border',
      // Big words, the selected one full strength: a section's heading that is also its filter.
      heading: 'flex flex-wrap gap-x-7 gap-y-1',
      // Small rounded segments in a tray: a quiet control beside a heading.
      tray: 'inline-flex rounded-full bg-card p-1.25',
    },
  },
})

const item = cva('cursor-pointer data-[state=on]:cursor-default', {
  variants: {
    look: {
      boxed: `border-border not-first:border-l px-3 font-medium text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=on]:bg-primary-fill data-[state=on]:text-primary-foreground`,
      heading: `${FOCUS} rounded-sm py-1 font-semibold text-dim text-lead leading-[1.2] tracking-[-0.02em] transition-colors duration-400 ease-settle hover:text-muted-foreground data-[state=on]:text-foreground`,
      tray: `${FOCUS} rounded-full px-4 py-2 text-muted-foreground text-small transition-colors duration-500 ease-settle hover:text-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground`,
    },
  },
})

/**
 * A row of segments, exactly one of them selected (a radio group). Clicking the selected one keeps
 * it. Arrow keys move between segments; Space or Enter picks one. Looks: `boxed` (default) is one
 * bordered control with a coral selection; `heading` sets the segments as a section heading;
 * `tray` is a small rounded tray.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  look = 'boxed',
}: {
  /** Names the group for screen readers. */
  label: string
  options: readonly { label: string; value: T }[]
  value: T
  onValueChange: (value: T) => void
  look?: 'boxed' | 'heading' | 'tray'
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      className={root({ look })}
    >
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value} className={item({ look })}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
